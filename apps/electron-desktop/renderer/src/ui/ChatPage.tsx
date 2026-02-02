import React from "react";
import { useGatewayRpc } from "../gateway/context";

type ChatHistoryResult = {
  sessionKey: string;
  sessionId: string;
  messages: unknown[];
  thinkingLevel?: string;
};

type ChatEvent = {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  // Gateway WS is on the same host/port.
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function extractText(msg: unknown): string {
  try {
    if (!msg || typeof msg !== "object") {
      return "";
    }
    const m = msg as { content?: unknown };
    const content = m.content;
    if (!Array.isArray(content)) {
      return "";
    }
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") {
          return "";
        }
        const part = p as { type?: unknown; text?: unknown };
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  } catch {
    return "";
  }
}

export function ChatPage({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [sessionKey, setSessionKey] = React.useState("main");
  const [input, setInput] = React.useState("");
  const [history, setHistory] = React.useState<ChatHistoryResult | null>(null);
  const [events, setEvents] = React.useState<ChatEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const gw = useGatewayRpc();

  React.useEffect(() => {
    return gw.onEvent((evt) => {
      if (evt.event !== "chat") {
        return;
      }
      const payload = evt.payload as ChatEvent;
      setEvents((prev) => [...prev, payload]);
    });
  }, [gw]);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const res = (await gw.request("chat.history", { sessionKey, limit: 200 })) as ChatHistoryResult;
      setHistory(res);
    } catch (err) {
      setError(String(err));
    }
  }, [gw, sessionKey]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const send = React.useCallback(async () => {
    const message = input.trim();
    if (!message) {
      return;
    }
    setInput("");
    setError(null);
    try {
      await gw.request("chat.send", {
        sessionKey,
        message,
        deliver: false,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (err) {
      setError(String(err));
    }
  }, [gw, input, sessionKey]);

  return (
    <div className="Centered" style={{ alignItems: "stretch", padding: 12 }}>
      <div className="Card" style={{ width: "min(1100px, 96vw)", height: "calc(100vh - 68px)" }}>
        <div className="CardTitle">Chat (native)</div>
        <div className="CardSubtitle" style={{ marginBottom: 10 }}>
          This talks to the Gateway over WS using <code>chat.history</code>/<code>chat.send</code>.
        </div>

        <div className="Meta" style={{ marginTop: 0 }}>
          <div className="Pill">ws: {toWsUrl(state.url)}</div>
          <div className="Pill">sessionKey: {sessionKey}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <input
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder="sessionKey (e.g. main)"
            style={{
              flex: "0 0 220px",
              borderRadius: 10,
              border: "1px solid rgba(230,237,243,0.16)",
              background: "rgba(230,237,243,0.06)",
              color: "var(--text)",
              padding: "8px 10px",
            }}
          />
          <button onClick={() => void refresh()}>Refresh</button>
        </div>

        {error ? (
          <div className="CardSubtitle" style={{ color: "rgba(255, 122, 0, 0.95)" }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "70%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <div className="Pill">History</div>
            <pre style={{ flex: 1 }}>
              {history
                ? history.messages
                    .map((m) => {
                      const role = (m as { role?: unknown }).role;
                      const text = extractText(m);
                      return `${typeof role === "string" ? role : "?"}: ${text || JSON.stringify(m)}`;
                    })
                    .join("\n\n")
                : "Loading…"}
            </pre>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <div className="Pill">Events (chat)</div>
            <pre style={{ flex: 1 }}>{events.map((e) => JSON.stringify(e)).join("\n") || "—"}</pre>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            style={{
              flex: 1,
              borderRadius: 10,
              border: "1px solid rgba(230,237,243,0.16)",
              background: "rgba(230,237,243,0.06)",
              color: "var(--text)",
              padding: "8px 10px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void send();
              }
            }}
          />
          <button className="primary" onClick={() => void send()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

