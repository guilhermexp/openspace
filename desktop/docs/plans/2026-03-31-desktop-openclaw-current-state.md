# OpenSpace Desktop + OpenClaw Current State

> Data: 2026-03-31
> Projeto: OpenSpace Desktop
> Status: documentado conforme estado atual do ambiente e do codigo

## Objetivo

Registrar o estado atual do desktop e da integracao com o `openclaw` depois dos ajustes feitos nesta sessao, incluindo:

- gateway local na porta `1515`
- conflito entre desktop dev e `LaunchAgent` global
- desativacao de PostHog
- comportamento atual de providers/modelos
- persistencia e saneamento do setup token da Anthropic

## Resumo Executivo

O estado correto agora e:

- o `desktop` em dev prefere a porta `1515`
- o `openclaw` global local tambem foi alinhado para `1515`
- quando o `LaunchAgent` global estiver ocupando `1515`, o desktop dev descarrega esse servico antes de subir seu gateway embutido
- PostHog foi desligado de verdade no renderer e no main process
- o fluxo de providers/modelos foi alinhado com o AtomicBot no que estava quebrado
- o `models.list` no `openclaw` voltou a devolver catalogo completo, evitando provider “configurado” com lista vazia de modelos
- o setup token da Anthropic agora e sanitizado antes de persistir, removendo whitespace que quebrava o bearer token
- o fluxo de voz no desktop agora suporta:
  - transcricao local e remota sem `audio.transcribe`
  - mensagens de voz por sessao
  - respostas em audio usando a mesma OpenAI key salva no Electron
  - renderizacao inline de audio e imagem no chat
  - `voice mode` com texto oculto por padrao e logs recolhidos automaticamente

## Gateway

### Porta correta

A porta local correta do ambiente atual e `1515`.

### Estado do desktop

O desktop usa `1515` como porta padrao:

- `desktop/src/main/constants.ts`

O bootstrap do desktop agora executa uma preflight em dev/macOS:

- `desktop/src/main/bootstrap/app-bootstrap.ts`
- `desktop/src/main/bootstrap/dev-global-gateway.ts`

Comportamento:

- se o app estiver empacotado, nao faz nada
- se nao for macOS, nao faz nada
- se `1515` estiver livre, nao faz nada
- se `1515` estiver ocupada pelo `LaunchAgent` global `ai.openclaw.gateway`, o desktop roda `launchctl bootout gui/<uid>/ai.openclaw.gateway` e depois sobe o gateway embutido

### Estado do servico global

O servico global do `openclaw` local foi alinhado para `1515`.

Arquivos locais relevantes:

- `~/.openclaw/openclaw.json`
- `~/Library/LaunchAgents/ai.openclaw.gateway.plist`

Estado esperado:

- `gateway.port = 1515` na config local
- `OPENCLAW_GATEWAY_PORT=1515` no plist
- `openclaw gateway status` deve mostrar `Probe target: ws://127.0.0.1:1515`

### Regra operacional

Existem dois jeitos de rodar gateway localmente:

1. servico global instalado via `openclaw gateway ...`
2. gateway embutido do desktop em dev

Se os dois disputarem a mesma porta, o comportamento antigo era o desktop cair para uma porta aleatoria. Agora o desktop tenta resolver isso descarregando o servico global em dev/macOS.

## Providers E Modelos

### Problema original

O provider aparecia como configurado, mas a UI ficava sem modelos para selecionar.

### Causa raiz

A divergencia real estava no `openclaw`, nao so no desktop.

Arquivo:

- `openclaw/src/gateway/server-methods/models.ts`

O fork local estava filtrando o catalogo de modelos; o AtomicBot devolvia o catalogo completo. Isso quebrava a selecao de modelos para provider recem-configurado.

### Estado atual

`models.list` foi alinhado de volta ao comportamento do AtomicBot: catalogo completo.

Teste relacionado:

- `openclaw/src/gateway/server.models-voicewake-misc.test.ts`

### Desktop

No desktop tambem ficaram alinhados os pontos de troca de modo/auth que estavam puxando comportamento do dashboard legacy:

- `desktop/renderer/src/store/slices/auth/authSlice.ts`
- `desktop/renderer/src/store/slices/session-model-reset.ts`
- `desktop/renderer/src/ui/settings/account-models/AccountModelsTab.tsx`
- `desktop/renderer/src/ui/settings/providers/useModelProvidersState.ts`

Estado esperado:

- provider configurado deve permitir selecionar modelo na propria tela
- troca entre subscription e own API key nao deve ficar presa em estado legado

## PostHog

PostHog foi desligado de verdade no desktop.

Arquivos:

- `desktop/renderer/src/analytics/posthog-client.ts`
- `desktop/src/main/analytics/posthog-main.ts`

Estado esperado:

- nao chamar `posthog.init`
- nao enviar eventos
- sumir o warning `PostHog was initialized without a token` como efeito colateral da desativacao real

## Anthropic Setup Token

### Problema original

A UI aceitava o token, marcava o provider como configurado, mas a autenticacao falhava com:

- `HTTP 401 authentication_error: Invalid bearer token`

### Causa raiz encontrada

O token estava sendo persistido, mas com whitespace interno.

Arquivo local de runtime:

- `~/Library/Application Support/openspace-desktop/openclaw/agents/main/agent/auth-profiles.json`

Profile relevante:

- `anthropic:default`

Tipo:

- `token`

### Correcoes aplicadas

Normalizacao de token no main process:

- `desktop/src/main/keys/authProfilesStore.ts`
- `desktop/src/main/keys/apiKeys.ts`

Comportamento atual:

- ao ler `auth-profiles.json`, token `type: "token"` e sanitizado com remocao de whitespace
- ao persistir novo token, whitespace interno tambem e removido
- `writeAuthProfilesStoreAtomic` tambem sanitize o token, protegendo contra regravacao ruim vinda de restore/local state

Teste relacionado:

- `desktop/src/main/keys/authProfilesStore.test.ts`

### Estado local corrigido

O token Anthropic salvo localmente ja foi sanitizado no arquivo de runtime acima.

Estado esperado agora:

- `anthropic:default` continua presente
- token sem espacos ou quebras de linha
- login por Claude subscription deixa de falhar por erro de formacao local do bearer token

## Voice Mode E Midia Inline

### Objetivo do fluxo

O desktop agora suporta um fluxo de conversa por voz por sessao:

- o mic original do composer continua sendo transcricao para texto
- existe um segundo botao no chat input para mensagem de voz
- ao usar mensagem de voz, a fala e transcrita e enviada como mensagem
- a sessao pode entrar em `voice mode`, fazendo a resposta voltar em audio
- quando `voice mode` esta ativo, o audio e tratado como saida principal do turno

### Captura e transcricao de voz

Estado atual do desktop:

- `desktop/renderer/src/ui/chat/hooks/useVoiceInput.ts`
- `desktop/renderer/src/ui/chat/hooks/useWavRecorder.ts`
- `desktop/src/main/whisper/ipc.ts`

Comportamento atual:

- tanto `local` quanto `openai` gravam em WAV via `useWavRecorder`
- o modo `openai` nao depende mais do `MediaRecorder` do Chromium para enviar `webm/ogg`
- a transcricao OpenAI e enviada como `audio/wav` com `recording.wav`
- isso remove o erro intermitente `HTTP 400: Audio file might be corrupted or unsupported`

### TTS com key do Electron

O provider `openai` de TTS reaproveita a API key salva no Electron, sem precisar duplicar segredo em `openclaw.json`.

Arquivos relevantes:

- `desktop/src/main/keys/openai-api-key.ts`
- `desktop/src/main/gateway/spawn.ts`
- `openclaw/extensions/openai/speech-provider.ts`

### Renderizacao inline no chat

O chat do desktop agora renderiza inline:

- audio de `tts`
- imagens geradas por tool
- artefatos locais resolvidos via bridge do Electron

Arquivos relevantes:

- `desktop/renderer/src/ui/chat/components/ToolCallCard.tsx`
- `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`
- `desktop/renderer/src/ui/chat/components/inline-media.tsx`
- `desktop/src/main/ipc/file-reader.ts`
- `desktop/src/preload.ts`

### Ordenacao visual do turno

Estado esperado do turno do assistente em `voice mode`:

- logs normais primeiro, se existirem
- texto do assistente apenas quando estrutural
- imagens/tool outputs visuais no meio
- audio de `tts` por ultimo, como fechamento do turno

Isso foi alinhado em:

- `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`

### Texto oculto por padrao no modo voz

Quando o `voice mode` esta ativo:

- texto normal do assistente fica oculto por padrao
- texto continua aparecendo automaticamente se contiver:
  - link/URL
  - comando/codigo
  - caminho de arquivo
  - lista/passos
  - JSON/tabela/bloco estrutural

Arquivos relevantes:

- `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`
- `desktop/renderer/src/ui/chat/components/ToolCallCard.tsx`

### Logs recolhidos automaticamente em voice mode

Para evitar que o usuario tenha de rolar ate cima para achar o audio:

- `ActionLog` comum entra recolhido por padrao em `voice mode`
- `ActionLog` ao vivo tambem entra recolhido
- o card de `tts` NAO e recolhido, para o play continuar imediatamente visivel
- logs continuam expandiveis manualmente

Arquivos relevantes:

- `desktop/renderer/src/ui/chat/components/ActionLog.tsx`
- `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`

### Botao de mensagem de voz

Estado esperado do composer:

- mic original: `segurar para transcrever`
- segundo mic: `clicar para comecar mensagem de voz` / `clicar novamente para enviar`

Importante:

- houve uma regressao em que a gravacao era cancelada no primeiro rerender
- a causa foi o cleanup do `useEffect` em `useVoiceInput` depender do objeto inteiro do recorder
- isso foi corrigido fazendo o cleanup depender apenas de `cancelRecording` estavel

Arquivos relevantes:

- `desktop/renderer/src/ui/chat/components/ChatComposer.tsx`
- `desktop/renderer/src/ui/chat/hooks/useVoiceInput.ts`

### Voz OpenAI selecionavel

O desktop agora permite trocar a voz OpenAI em `Settings > Voice`.

Arquivo principal:

- `desktop/renderer/src/ui/settings/voice/VoiceRecognitionTab.tsx`

Catalogo fixo atual:

- `alloy`
- `ash`
- `ballad`
- `coral`
- `echo`
- `sage`
- `shimmer`
- `verse`

## Warnings Observados Em Dev

Os logs recentes mostraram warnings e ruidos esperados de desenvolvimento, mas sem erro funcional bloqueante para a UI no estado atual.

### Warnings aceitaveis / nao bloqueantes

- `vite`:
  - `Some chunks are larger than 500 kB after minification`
  - e warning de bundle grande, nao quebra runtime
- `npm`:
  - `Unknown env config "npm-globalconfig"`
  - `verify-deps-before-run`
  - `_jsr-registry`
  - `allow-build`
  - sao warnings de config herdada, nao falha funcional do app
- `Electron`:
  - `'console-message' arguments are deprecated`
  - e warning da API usada para forward de logs do renderer para o terminal
- `Chromium WebAudio`:
  - `The ScriptProcessorNode is deprecated. Use AudioWorkletNode instead.`
  - warning conhecido; a captura continua funcionando

### O que nao apareceu como erro funcional no ultimo log

No ultimo log enviado:

- gateway subiu corretamente em `1515`
- renderer carregou (`dom-ready`)
- nao apareceu mais o `HTTP 400` da OpenAI transcription naquele trecho
- a UI de `voice mode` foi validada manualmente como funcionando

### Melhorias futuras opcionais

- migrar `useWavRecorder` de `ScriptProcessorNode` para `AudioWorkletNode`
- trocar o forward de logs do renderer para a API nova do Electron
- revisar chunking do bundle do renderer se performance de carregamento virar prioridade

## Arquivos De Codigo Alterados

### Desktop

- `desktop/src/main/bootstrap/app-bootstrap.ts`
- `desktop/src/main/bootstrap/app-bootstrap.test.ts`
- `desktop/src/main/bootstrap/dev-global-gateway.ts`
- `desktop/src/main/bootstrap/dev-global-gateway.test.ts`
- `desktop/src/main/keys/apiKeys.ts`
- `desktop/src/main/keys/authProfilesStore.ts`
- `desktop/src/main/keys/authProfilesStore.test.ts`
- `desktop/src/main/analytics/posthog-main.ts`
- `desktop/src/main/analytics/posthog-main.test.ts`
- `desktop/renderer/src/analytics/posthog-client.ts`
- `desktop/renderer/src/analytics/posthog-client.test.ts`
- `desktop/renderer/src/store/slices/auth/authSlice.ts`
- `desktop/renderer/src/store/slices/auth/authSlice.test.ts`
- `desktop/renderer/src/store/slices/session-model-reset.ts`
- `desktop/renderer/src/ui/settings/account-models/AccountModelsTab.tsx`
- `desktop/renderer/src/ui/settings/account-models/AccountModelsTab.module.css`
- `desktop/renderer/src/ui/settings/account-models/AccountModelsTab.test.tsx`
- `desktop/renderer/src/ui/settings/providers/useModelProvidersState.ts`
- `desktop/src/main/gateway/config-migrations.ts`
- `desktop/src/main/gateway/config-migrations.test.ts`
- `desktop/src/main/gateway/spawn.ts`
- `desktop/src/main/gateway/spawn.test.ts`
- `desktop/src/main/ipc/file-reader.ts`
- `desktop/src/main/ipc/file-reader.test.ts`
- `desktop/src/main/keys/openai-api-key.ts`
- `desktop/src/main/keys/openai-api-key.test.ts`
- `desktop/src/main/whisper/ipc.ts`
- `desktop/src/main/whisper/ipc.test.ts`
- `desktop/src/preload.ts`
- `desktop/src/preload.test.ts`
- `desktop/renderer/index.html`
- `desktop/renderer/src/store/slices/chat/chat-types.ts`
- `desktop/renderer/src/store/slices/chat/chat-utils.ts`
- `desktop/renderer/src/store/slices/chat/chat-utils.test.ts`
- `desktop/renderer/src/store/slices/chat/chatSlice.ts`
- `desktop/renderer/src/store/slices/chat/chatSlice.test.ts`
- `desktop/renderer/src/store/slices/chat/chat-thunks.ts`
- `desktop/renderer/src/ui/chat/ChatPage.tsx`
- `desktop/renderer/src/ui/chat/components/ActionLog.tsx`
- `desktop/renderer/src/ui/chat/components/ActionLog.test.tsx`
- `desktop/renderer/src/ui/chat/components/ChatComposer.tsx`
- `desktop/renderer/src/ui/chat/components/ChatComposer.test.tsx`
- `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`
- `desktop/renderer/src/ui/chat/components/ChatMessageList.audio.test.tsx`
- `desktop/renderer/src/ui/chat/components/ToolCallCard.tsx`
- `desktop/renderer/src/ui/chat/components/ToolCallCard.test.tsx`
- `desktop/renderer/src/ui/chat/components/artifact-preview.ts`
- `desktop/renderer/src/ui/chat/components/inline-media.tsx`
- `desktop/renderer/src/ui/chat/context/ArtifactContext.tsx`
- `desktop/renderer/src/ui/chat/context/ArtifactContext.test.tsx`
- `desktop/renderer/src/ui/chat/hooks/useVoiceConfig.ts`
- `desktop/renderer/src/ui/chat/hooks/useVoiceConfig.test.tsx`
- `desktop/renderer/src/ui/chat/hooks/useVoiceInput.ts`
- `desktop/renderer/src/ui/chat/hooks/useVoiceInput.test.ts`
- `desktop/renderer/src/ui/settings/voice/VoiceRecognitionTab.tsx`
- `desktop/renderer/src/ui/settings/voice/VoiceRecognitionTab.module.css`
- `desktop/renderer/src/ui/settings/voice/VoiceRecognitionTab.test.tsx`

### OpenClaw

- `openclaw/src/gateway/server-methods/models.ts`
- `openclaw/src/gateway/server-methods/chat.ts`
- `openclaw/src/gateway/protocol/schema/sessions.ts`
- `openclaw/src/gateway/sessions-patch.ts`
- `openclaw/src/gateway/server.models-voicewake-misc.test.ts`
- `openclaw/src/gateway/server.chat.gateway-server-chat.test.ts`
- `openclaw/src/gateway/server.chat.gateway-server-chat-b.test.ts`
- `openclaw/src/gateway/server.sessions.gateway-server-sessions-a.test.ts`
- `openclaw/ui/src/ui/app.ts`
- `openclaw/ui/src/ui/controllers/exec-approval.ts`
- `openclaw/ui/src/ui/controllers/exec-approval.test.ts`
- `openclaw/ui/src/ui/app-gateway.sessions.node.test.ts`
- `openclaw/extensions/openai/speech-provider.ts`
- `openclaw/extensions/openai/speech-provider.test.ts`

## Arquivos Locais Fora Do Repo

Mudancas locais importantes feitas no ambiente:

- `~/.openclaw/openclaw.json`
- `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- `~/Library/Application Support/openspace-desktop/openclaw/agents/main/agent/auth-profiles.json`

Esses arquivos afetam runtime local, mas nao fazem parte do git do projeto.

## Validacao Executada

### Gateway / bootstrap

- `pnpm exec vitest run src/main/bootstrap/dev-global-gateway.test.ts src/main/bootstrap/app-bootstrap.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`

### Auth profiles / token sanitization

- `pnpm exec vitest run src/main/keys/authProfilesStore.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`

### Providers / account models

- `pnpm exec vitest run renderer/src/store/slices/auth/authSlice.test.ts renderer/src/ui/settings/account-models/AccountModelsTab.test.tsx`
- `pnpm exec tsc -p tsconfig.json --noEmit`

### PostHog

- `pnpm exec vitest run renderer/src/analytics/posthog-client.test.ts src/main/analytics/posthog-main.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`

### OpenClaw models.list

- `pnpm exec vitest run --config vitest.config.ts src/gateway/server.models-voicewake-misc.test.ts`

### Voice mode / chat renderer / inline media

- `pnpm exec vitest run renderer/src/ui/chat/components/ActionLog.test.tsx renderer/src/ui/chat/components/ChatComposer.test.tsx renderer/src/ui/chat/components/ChatMessageList.audio.test.tsx renderer/src/ui/chat/components/ToolCallCard.test.tsx renderer/src/ui/chat/hooks/useVoiceConfig.test.tsx renderer/src/ui/chat/hooks/useVoiceInput.test.ts renderer/src/store/slices/chat/chat-utils.test.ts renderer/src/store/slices/chat/chatSlice.test.ts`
- `pnpm exec vitest run src/main/whisper/ipc.test.ts src/main/ipc/file-reader.test.ts src/main/gateway/spawn.test.ts src/main/gateway/config-migrations.test.ts`
- `pnpm exec tsc -p renderer/tsconfig.typecheck.json --noEmit`
- `pnpm exec tsc -p tsconfig.json --noEmit`

## Procedimento Manual Esperado

### Rodar desktop em dev

Com o estado atual, `pnpm run dev:all` deve usar `1515` como gateway local do desktop.

Se quiser subir o servico global depois:

- `openclaw gateway restart`

Se quiser operar so com o servico global:

- nao use o desktop dev para o mesmo gateway ao mesmo tempo, ou deixe o desktop descarregar o `LaunchAgent` quando subir

### Revalidar Anthropic subscription

Se voltar a aparecer `401 Invalid bearer token`:

1. conferir `auth-profiles.json`
2. validar se o token salvo nao tem whitespace
3. se estiver limpo e ainda falhar, gerar novo token porque o problema deixa de ser formacao local e passa a ser token invalido/expirado

## Riscos E Observacoes

- o `openclaw` continua com varios defaults/testes/documentacao historicos em `18789`; isso nao e a porta operacional desejada para o desktop atual
- o doc registra o estado real do ambiente local nesta data; parte dele depende de arquivos locais fora do git
- `openclaw` e submodulo, entao mudancas nele aparecem separadamente do repo raiz
