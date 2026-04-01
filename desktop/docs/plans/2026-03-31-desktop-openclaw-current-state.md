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

### OpenClaw

- `openclaw/src/gateway/server-methods/models.ts`
- `openclaw/src/gateway/server.models-voicewake-misc.test.ts`
- `openclaw/ui/src/ui/app.ts`
- `openclaw/ui/src/ui/controllers/exec-approval.ts`
- `openclaw/ui/src/ui/controllers/exec-approval.test.ts`
- `openclaw/ui/src/ui/app-gateway.sessions.node.test.ts`

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
