# Gateway Message Metadata — Como funciona

Guia tecnico de como o OpenClaw Gateway expoe dados de uso (tokens, modelo, cache, custo) nas mensagens e como o Electron Desktop consome isso.

---

## 1. Origem dos dados — Gateway

Quando o agente processa uma mensagem, o runtime do OpenClaw anexa metadata em cada mensagem do assistente antes de persistir no historico da sessao.

### Campos anexados em cada mensagem `role: "assistant"`:

```json
{
  "role": "assistant",
  "content": [...],
  "timestamp": 1711137600000,
  "model": "anthropic/claude-opus-4-6",
  "usage": {
    "input": 4500,
    "inputTokens": 4500,
    "output": 371,
    "outputTokens": 371,
    "cacheRead": 26000,
    "cache_read_input_tokens": 26000,
    "cacheWrite": 212,
    "cache_creation_input_tokens": 212
  },
  "cost": {
    "total": 0.0234
  }
}
```

### Onde esses dados sao gerados:

| Campo                                                    | Origem no runtime                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| `model`                                                  | Provider que respondeu (ex: `anthropic/claude-opus-4-6`)             |
| `usage.input` / `usage.inputTokens`                      | Tokens de entrada consumidos na chamada API                          |
| `usage.output` / `usage.outputTokens`                    | Tokens de saida gerados                                              |
| `usage.cacheRead` / `usage.cache_read_input_tokens`      | Tokens lidos do cache de prompt (Anthropic prompt caching)           |
| `usage.cacheWrite` / `usage.cache_creation_input_tokens` | Tokens escritos no cache de prompt                                   |
| `cost.total`                                             | Custo estimado em USD via `estimateUsageCost()` em `usage-format.ts` |

> Os campos duplicados (ex: `input` e `inputTokens`) existem por compatibilidade com diferentes versoes da API. O consumer deve checar ambos: `usage.input ?? usage.inputTokens ?? 0`.

### Onde o historico fica persistido:

```
~/.openclaw/sessions/<agentId>/sessions.json
```

Ou o path configurado em `session.store` no config.

---

## 2. Como acessar via WebSocket RPC

### `chat.history` — Historico de mensagens

```typescript
const result = await gateway.request("chat.history", {
  sessionKey: "agent:main:desktop:...",
  limit: 200,
});
// result.messages = array de mensagens raw com usage/model/cost
```

Cada mensagem do assistente no array tera `usage`, `model`, `cost` se disponivel.

### `status` — Status geral da sessao

```typescript
const result = await gateway.request("status", { sessionKey });
// result.sessions[0] = { model, inputTokens, outputTokens, contextWindow, agentId }
```

### Comando `/status` — Via chat

Qualquer canal conectado:

```
/status
```

Retorna cartao com modelo, tokens, contexto, compactacoes.

### Tool interna `session_status`

O agente usa internamente. Aceita:

- `sessionKey` — consultar outra sessao
- `model` — trocar modelo ("default" reseta)

---

## 3. Como o Control UI (dashboard web) consome

Arquivo: `ui/src/ui/chat/grouped-render.ts`

O Control UI (Lit/web components) extrai metadata de cada mensagem no historico:

```typescript
function extractGroupMeta(group: MessageGroup, contextWindow: number | null): GroupMeta {
  for (const { message } of group.messages) {
    if (m.role !== "assistant") continue;

    const usage = m.usage;
    if (usage) {
      input += usage.input ?? usage.inputTokens ?? 0;
      output += usage.output ?? usage.outputTokens ?? 0;
      cacheRead += usage.cacheRead ?? usage.cache_read_input_tokens ?? 0;
      cacheWrite += usage.cacheWrite ?? usage.cache_creation_input_tokens ?? 0;
    }

    if (m.cost?.total) cost += m.cost.total;
    if (typeof m.model === "string") model = m.model;
  }

  const contextPercent =
    contextWindow && input > 0 ? Math.round((input / contextWindow) * 100) : null;

  return { input, output, cacheRead, cacheWrite, cost, model, contextPercent };
}
```

Renderiza como:

```
Marreta  12:37  ↑1  ↓265  R26k  W212  $0.0234  0% ctx  claude-opus-4-6
```

CSS em: `ui/src/styles/chat/grouped.css` (classes `.msg-meta__*`)

---

## 4. Como o Electron Desktop consome

### 4.1 Parser de historico

Arquivo: `desktop/renderer/src/store/slices/chat/chat-utils.ts`

O `parseHistoryMessages()` extrai `usage` e `model` de cada mensagem raw:

```typescript
const rawUsage = msg.usage;
const messageUsage =
  role === "assistant" && rawUsage
    ? {
        input: rawUsage.input ?? rawUsage.inputTokens ?? 0,
        output: rawUsage.output ?? rawUsage.outputTokens ?? 0,
        cacheRead: rawUsage.cacheRead ?? rawUsage.cache_read_input_tokens ?? 0,
        cacheWrite: rawUsage.cacheWrite ?? rawUsage.cache_creation_input_tokens ?? 0,
      }
    : undefined;

const messageModel =
  role === "assistant" && typeof msg.model === "string" && msg.model !== "gateway-injected"
    ? msg.model
    : undefined;
```

### 4.2 Tipos

Arquivo: `desktop/renderer/src/store/slices/chat/chat-types.ts`

```typescript
type UiMessageUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

type UiMessage = {
  // ... outros campos
  usage?: UiMessageUsage;
  model?: string;
};
```

### 4.3 Componente de renderizacao

Arquivo: `desktop/renderer/src/ui/chat/components/MessageMeta.tsx`

Renderiza inline abaixo de cada mensagem do assistente:

```
OpenSpace  13:40  ↑4k  ↓371  R26k  W212  claude-opus-4-6
```

Props recebidas diretamente da mensagem:

- `ts` — timestamp da mensagem
- `usage` — tokens input/output/cache
- `model` — modelo que respondeu

Fallback: se `model` nao vier na mensagem, le do config (`agents.defaults.model.primary`).

### 4.4 Integracao no ChatMessageList

Arquivo: `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`

```tsx
{
  /* Dentro de cada bloco de mensagem assistant com texto */
}
<MessageMeta ts={m.ts} usage={m.usage} model={m.model} />;
```

---

## 5. Fluxo completo

```
[API Provider] → response com usage headers
       ↓
[OpenClaw Runtime] → anexa usage/model/cost na mensagem
       ↓
[Session Store] → persiste em sessions.json
       ↓
[Gateway WS] → chat.history retorna mensagens com metadata
       ↓
[Electron] → parseHistoryMessages() extrai usage/model
       ↓
[Redux Store] → UiMessage com usage/model
       ↓
[MessageMeta] → renderiza inline: "OpenSpace 13:40 ↑4k ↓371 R26k claude-opus-4-6"
```

---

## 6. Referencia de arquivos

| Arquivo                                                          | Responsabilidade                         |
| ---------------------------------------------------------------- | ---------------------------------------- |
| `ui/src/ui/chat/grouped-render.ts`                               | Control UI — extrai e renderiza metadata |
| `ui/src/styles/chat/grouped.css`                                 | Control UI — estilos `.msg-meta__*`      |
| `desktop/renderer/src/store/slices/chat/chat-types.ts`           | Tipos `UiMessageUsage`, `UiMessage`      |
| `desktop/renderer/src/store/slices/chat/chat-utils.ts`           | Parser `parseHistoryMessages()`          |
| `desktop/renderer/src/ui/chat/components/MessageMeta.tsx`        | Componente de metadata inline            |
| `desktop/renderer/src/ui/chat/components/MessageMeta.module.css` | Estilos do MessageMeta                   |
| `desktop/renderer/src/ui/chat/components/ChatMessageList.tsx`    | Integracao do MessageMeta nas mensagens  |
