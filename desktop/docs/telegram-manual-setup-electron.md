# Telegram Manual Setup via Electron

> Última atualização: 2026-03-28
> Escopo: fluxo manual do Telegram dentro do app Electron, pela tela `Settings > Messengers`

## Objetivo

Documentar exatamente como o app atual configura o Telegram manualmente pelo Electron, para replicar o mesmo comportamento em outro app.

## Onde isso está no código

- Entrada da tela/lista: [ConnectorsTab.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/ConnectorsTab.tsx)
- Estado do card e status: [useConnectorsStatus.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/useConnectorsStatus.ts)
- Modal do Telegram: [TelegramModal.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/TelegramModal.tsx)
- Hook com a lógica real da configuração: [useTelegramConfig.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/useTelegramConfig.ts)
- Campo do token: [TelegramTokenStep.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/TelegramTokenStep.tsx)
- Campo da allowlist: [TelegramAllowlistStep.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/TelegramAllowlistStep.tsx)
- Edição/disable: [TelegramEditView.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/TelegramEditView.tsx)
- Entry do plugin no gateway: [index.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/index.ts)
- Wizard/setup oficial do plugin: [setup-surface.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/src/setup-surface.ts)
- Schema do provider: [zod-schema.providers-core.ts](<home>/Documents/Projetos/openspace/openclaw/src/config/zod-schema.providers-core.ts)
- Resolução do token em runtime: [token.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/src/token.ts)
- Gate de DM/allowlist em runtime: [dm-access.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/src/dm-access.ts)

## Resumo da arquitetura

O Electron não faz login no Telegram e não chama a API do Telegram para validar o token no momento do setup. O fluxo é 100% config-driven:

1. O renderer lê o config atual via `gw.request("config.get", {})`.
2. O modal decide qual etapa mostrar com base no conteúdo atual de `channels.telegram`.
3. Ao salvar, o renderer manda `gw.request("config.patch", { baseHash, raw, note })`.
4. O `raw` sempre escreve em:
   - `channels.telegram.*`
   - `plugins.entries.telegram.enabled`
5. O gateway/plugin do Telegram sobe a partir dessa config.

Em outras palavras: a UI só persiste config. Quem realmente “conecta” o Telegram é o runtime do plugin depois.

## Fluxo exato da UI

### 1. Tela de entrada

Na lista `Settings > Messengers`, clicar no card `Telegram` abre um `Modal` dedicado, em [ConnectorsTab.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/ConnectorsTab.tsx#L245).

O label do botão do card muda conforme o status:

- `Connect`
- `Manage`
- `Reconnect`

### 2. Como o Electron decide o status do card

O status do Telegram vem de [useConnectorsStatus.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/useConnectorsStatus.ts#L29):

- `disabled` se `channels.telegram.enabled === false`
- `connected` se `channels.telegram.botToken` existe e não é vazio
- `connected` também se `channels.telegram.enabled === true`
- `connect` caso contrário

Importante: isso é só status derivado de config. Não é health check real do bot.

## Fluxo do modal

O modal tem 3 estados em [TelegramModal.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/TelegramModal.tsx#L29):

1. `setupStep === "token"`
2. `setupStep === "allowlist"`
3. `setupStep === null` para modo de edição

### Regra de entrada

Na montagem, [useTelegramConfig.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/useTelegramConfig.ts#L38) carrega `config.get` e olha `channels.telegram`.

- Se `telegram.botToken` existir: entra em modo de edição
- Se não existir: entra no wizard em 2 passos, começando por `token`

Também carrega:

- `allowFrom`
- `dmPolicy` com default local `"pairing"`

## Passo 1: salvar token

UI em [TelegramTokenStep.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/TelegramTokenStep.tsx).

Comportamento em [useTelegramConfig.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/useTelegramConfig.ts#L95):

- Se não houver token digitado e o connector ainda não estiver marcado como conectado, bloqueia com erro `Bot token is required.`
- Monta um patch com `enabled: true`
- Só adiciona `botToken` se o campo não estiver vazio
- Salva via `config.patch`

Payload real do primeiro save:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABCDEF..."
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

`note`: `Settings: update Telegram bot token`

### O que acontece depois de salvar o token

Se era o primeiro setup:

- não fecha o modal
- avança para a etapa `allowlist`
- chama `onTokenSaved()`
- o card da lista já vira `Connected`

Esse detalhe é importante: o app considera “conectado” logo após salvar o token, antes de concluir a allowlist.

## Passo 2: allowlist de DM

UI em [TelegramAllowlistStep.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/TelegramAllowlistStep.tsx).

Ao clicar em `Add`, [useTelegramConfig.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/useTelegramConfig.ts#L134):

- normaliza o valor removendo prefixo `telegram:` ou `tg:`
- rejeita duplicado
- persiste:
  - `enabled: true`
  - `dmPolicy: "allowlist"`
  - `allowFrom: [...]`

Payload real do add:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "allowFrom": ["123456789"]
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

`note`: `Settings: add Telegram allowFrom entry`

### Botão `Done`

O botão `Done` em [TelegramModal.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/TelegramModal.tsx#L94):

- se existir `newId` pendente, salva esse ID antes de fechar
- se não existir `newId`, só fecha

Consequência exata da implementação atual:

- o usuário pode sair do wizard sem cadastrar ninguém na allowlist
- nesse caso o bot já fica “connected”, mas continua com a política atual, que localmente começa como `pairing`

## Modo de edição

Se já existir `botToken`, o modal abre em modo de edição, em [TelegramEditView.tsx](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/TelegramEditView.tsx).

Esse modo expõe:

- update de token
- add/remove de allowlist
- botão `Disable`

### Update de token com campo vazio

Se já existe token salvo e o campo ficar vazio, o botão `Update` ainda funciona. Nesse caso o patch enviado é só:

```json
{
  "channels": {
    "telegram": {
      "enabled": true
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

Ou seja: campo vazio em edição significa “não trocar token”.

### Remove da allowlist

Ao remover um item, o patch atual envia só:

```json
{
  "channels": {
    "telegram": {
      "allowFrom": ["...restante..."]
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

`note`: `Settings: remove Telegram allowFrom entry`

## Disable

O disable é centralizado em [useConnectorsStatus.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/useConnectorsStatus.ts#L111).

Payload real:

```json
{
  "channels": {
    "telegram": {
      "enabled": false
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": false
      }
    }
  }
}
```

`note`: `Settings: disable telegram`

## RPCs usados

O setup manual do Telegram usa só 2 métodos RPC:

### `config.get`

Usado para:

- carregar o snapshot atual
- obter `hash`
- decidir o estado inicial do modal

Formato relevante do snapshot em [types.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/onboarding/hooks/types.ts#L1):

```ts
type ConfigSnapshot = {
  hash?: string;
  config?: unknown;
};
```

### `config.patch`

Sempre exige:

- `baseHash`
- `raw` como string JSON
- `note`

O fluxo atual sempre faz:

1. `config.get`
2. extrai `hash`
3. `config.patch`

Se `hash` não existir, a UI falha com `Config base hash missing. Reload and try again.`

## Chaves de config realmente usadas

No setup manual atual, a UI só escreve no escopo top-level de `channels.telegram`, sem suporte a multi-account.

Chaves relevantes:

- `channels.telegram.enabled`
- `channels.telegram.botToken`
- `channels.telegram.allowFrom`
- `channels.telegram.dmPolicy`
- `plugins.entries.telegram.enabled`

No schema do runtime, as chaves base do Telegram estão em [zod-schema.providers-core.ts](<home>/Documents/Projetos/openspace/openclaw/src/config/zod-schema.providers-core.ts#L177):

- `enabled`
- `dmPolicy`
- `botToken`
- `tokenFile`
- `groups`
- `allowFrom`
- `groupAllowFrom`
- `groupPolicy`
- `webhookUrl`
- `webhookSecret`
- `accounts`
- `defaultAccount`

Mas a UI manual atual usa só o subconjunto acima.

## Comportamento do runtime depois da config

O plugin é registrado por [openclaw/extensions/telegram/index.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/index.ts).

### Resolução do token

O runtime resolve o token em [token.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/src/token.ts).

Prioridade atual do token para conta default:

1. `channels.telegram.accounts.<id>.tokenFile`
2. `channels.telegram.accounts.<id>.botToken`
3. `channels.telegram.tokenFile`
4. `channels.telegram.botToken`
5. `TELEGRAM_BOT_TOKEN`

Isso importa porque o setup manual do Electron grava em `channels.telegram.botToken`.

### Segurança de DM

O gate de DM está em [dm-access.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/src/dm-access.ts).

Regras principais:

- `dmPolicy === "disabled"`: bloqueia tudo em DM
- `dmPolicy === "open"`: libera tudo
- `dmPolicy === "pairing"`: sender não autorizado recebe pairing request
- `dmPolicy === "allowlist"`: só passa quem estiver em `allowFrom`

## Caveats reais da implementação atual

Esses pontos são importantes se você quiser replicar igual, ou melhorar conscientemente no outro app.

### 1. “Connected” não quer dizer validado

O card fica `Connected` se houver `botToken` ou só `enabled: true`. Não existe probe real do Telegram na hora do save.

### 2. O wizard deixa concluir sem allowlist

Depois de salvar o token, o card já vira conectado e o botão `Done` pode fechar sem nenhum ID salvo.

### 3. A UI pede “user ID”, mas não valida estritamente número

`normalizeId()` em [useTelegramConfig.ts](<home>/Documents/Projetos/openspace/desktop/renderer/src/ui/settings/connectors/modals/telegram/useTelegramConfig.ts#L8):

- remove prefixos `telegram:` e `tg:`
- se ficar numérico, usa esse número
- se não ficar numérico, persiste o texto original trimado

Só que o runtime normaliza `allowFrom` como IDs numéricos em [bot-access.ts](<home>/Documents/Projetos/openspace/openclaw/extensions/telegram/src/bot-access.ts#L35) e avisa que entradas inválidas não são ideais. Então a UI atual é mais permissiva que o runtime.

### 4. O setup manual não usa multi-account

Mesmo que o plugin suporte `channels.telegram.accounts.*`, a UI atual só escreve no Telegram top-level.

### 5. O setup manual não registra webhook

Ele não mexe em:

- `webhookUrl`
- `webhookSecret`
- `webhookPath`
- `webhookHost`
- `webhookPort`

Ou seja: esse fluxo é só bot token + enable + allowlist.

## Como replicar em outro app

Se você quiser copiar o comportamento atual 1:1, o mínimo é:

1. Criar um card `Telegram` com status derivado de config, não de health check.
2. Abrir um modal com wizard de 2 passos:
   - `Bot token`
   - `DM allowlist`
3. No mount, fazer `config.get`.
4. Se não existir `channels.telegram.botToken`, começar em `token`.
5. Ao salvar token, enviar `config.patch` com:
   - `channels.telegram.enabled = true`
   - `channels.telegram.botToken = <token>`
   - `plugins.entries.telegram.enabled = true`
6. Marcar o card como conectado logo após o token.
7. No passo 2, ao adicionar ID, enviar `config.patch` com:
   - `enabled: true`
   - `dmPolicy: "allowlist"`
   - `allowFrom: [...]`
8. Oferecer modo `Manage` para editar token, editar allowlist e desabilitar.

## Minha recomendação para replicar sem herdar os problemas

Se o objetivo for copiar a UX mas melhorar a robustez:

- validar token com uma probe leve antes de marcar como conectado
- exigir pelo menos um `allowFrom` antes de concluir o wizard
- validar `allowFrom` como numérico de verdade
- mostrar claramente quando o bot está em `pairing` vs `allowlist`
- se precisar multi-bot, modelar `channels.telegram.accounts.*` desde o começo

## JSON mínimo para o Telegram funcionar nesse fluxo

Config mínima equivalente ao “conectado” pelo Electron:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABCDEF..."
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

Config mínima equivalente ao “privado via allowlist”:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABCDEF...",
      "dmPolicy": "allowlist",
      "allowFrom": ["123456789"]
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```
