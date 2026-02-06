import React from "react";
import type { ChatAttachmentInput } from "../store/slices/chatSlice";
import { ActionButton } from "./kit";

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  attachments: ChatAttachmentInput[];
  onAttachmentsChange: (next: ChatAttachmentInput[] | ((prev: ChatAttachmentInput[]) => ChatAttachmentInput[])) => void;
  onSend: () => void;
  disabled?: boolean;
  sendLabel?: string;
  sendingLabel?: string;
  placeholder?: string;
};

export function ChatComposer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSend,
  disabled = false,
  sendLabel = "Send",
  sendingLabel = "Sending…",
  placeholder = "Write a message…",
}: ChatComposerProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const onFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) {
        return;
      }
      const add: ChatAttachmentInput[] = [];
      let done = 0;
      const total = files.length;
      const checkDone = () => {
        done += 1;
        if (done === total) {
          onAttachmentsChange((prev) => [...prev, ...add]);
          e.target.value = "";
        }
      };
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          const dataUrl = reader.result as string;
          add.push({
            id: crypto.randomUUID(),
            dataUrl,
            mimeType: file.type || "application/octet-stream",
          });
          checkDone();
        });
        reader.addEventListener("error", checkDone);
        reader.readAsDataURL(file);
      }
    },
    [onAttachmentsChange],
  );

  const removeAttachment = React.useCallback(
    (id: string) => {
      onAttachmentsChange((prev) => prev.filter((a) => a.id !== id));
    },
    [onAttachmentsChange],
  );

  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="UiChatComposer">
      {attachments.length > 0 && (
        <div className="UiChatAttachments">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith("image/");
            return (
              <div key={att.id} className="UiChatAttachment">
                {isImage ? (
                  <img src={att.dataUrl} alt="" className="UiChatAttachmentImg" />
                ) : (
                  <div className="UiChatAttachmentFile" title={att.mimeType}>
                    <span className="UiChatAttachmentFileIcon" aria-hidden="true">
                      📎
                    </span>
                    <span className="UiChatAttachmentFileLabel">
                      {att.mimeType === "application/pdf"
                        ? "PDF"
                        : att.mimeType.split("/")[0] || "File"}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="UiChatAttachmentRemove"
                  onClick={() => removeAttachment(att.id)}
                  aria-label="Remove attachment"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="UiChatComposerInner">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="UiChatFileInput"
          aria-hidden
          onChange={onFileChange}
        />
        <button
          type="button"
          className="UiChatAttachButton"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
          title="Attach file or image"
        >
          +
        </button>
        <textarea
          className="UiChatInput"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <ActionButton
          variant="primary"
          onClick={onSend}
          disabled={disabled || !canSend}
        >
          {disabled ? sendingLabel : sendLabel}
        </ActionButton>
      </div>
    </div>
  );
}
