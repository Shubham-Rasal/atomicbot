import React from "react";
import type { ChatAttachmentInput } from "../store/slices/chatSlice";

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 15.5017L10 4.83171M10 4.83171L5.42711 9.4046M10 4.83171L14.5729 9.4046"
        stroke="currentColor"
        stroke-width="1.5243"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  attachments: ChatAttachmentInput[];
  onAttachmentsChange: (
    next: ChatAttachmentInput[] | ((prev: ChatAttachmentInput[]) => ChatAttachmentInput[])
  ) => void;
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
  sendingLabel = "Sending...",
  placeholder = "Message...",
}: ChatComposerProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const MIN_INPUT_HEIGHT = 28;
  const MAX_INPUT_HEIGHT = 180;

  const adjustTextareaHeight = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    const next = Math.min(Math.max(el.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
    el.style.height = `${next}px`;
  }, []);

  React.useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

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
    [onAttachmentsChange]
  );

  const removeAttachment = React.useCallback(
    (id: string) => {
      onAttachmentsChange((prev) => prev.filter((a) => a.id !== id));
    },
    [onAttachmentsChange]
  );

  const canSend = value.trim().length > 0;

  return (
    <div className="UiChatComposer">
      <div className="UiChatComposerInner">
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M11.6667 1.89128V5.3334C11.6667 5.80011 11.6667 6.03346 11.7575 6.21172C11.8374 6.36852 11.9649 6.49601 12.1217 6.5759C12.2999 6.66673 12.5333 6.66673 13 6.66673H16.4421M11.6667 14.1667H6.66666M13.3333 10.8333H6.66666M16.6667 8.32353V14.3333C16.6667 15.7335 16.6667 16.4335 16.3942 16.9683C16.1545 17.4387 15.772 17.8212 15.3016 18.0609C14.7669 18.3333 14.0668 18.3333 12.6667 18.3333H7.33333C5.9332 18.3333 5.23313 18.3333 4.69835 18.0609C4.22795 17.8212 3.8455 17.4387 3.60581 16.9683C3.33333 16.4335 3.33333 15.7335 3.33333 14.3333V5.66667C3.33333 4.26654 3.33333 3.56647 3.60581 3.0317C3.8455 2.56129 4.22795 2.17884 4.69835 1.93916C5.23313 1.66667 5.9332 1.66667 7.33333 1.66667H10.0098C10.6213 1.66667 10.927 1.66667 11.2147 1.73575C11.4698 1.79699 11.7137 1.898 11.9374 2.03507C12.1897 2.18968 12.4059 2.40587 12.8382 2.83824L15.4951 5.4951C15.9275 5.92748 16.1437 6.14367 16.2983 6.39596C16.4353 6.61964 16.5363 6.8635 16.5976 7.11859C16.6667 7.40631 16.6667 7.71205 16.6667 8.32353Z"
                            stroke="currentColor"
                            stroke-width="1.66667"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="UiChatFileInput"
          aria-hidden
          onChange={onFileChange}
        />

        <textarea
          ref={textareaRef}
          className="UiChatInput"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />

        <div className="UiChatComposerButtonBlock">
          <button
            type="button"
            className="UiChatAttachButton"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
            title="Attach file or image"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
            >
              <path
                d="M9.00012 3.1499V14.8499M14.8501 8.9999H3.15012"
                stroke="white"
                stroke-width="1.503"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="UiChatSendButton"
            onClick={onSend}
            disabled={disabled || !canSend}
            aria-label={disabled ? sendingLabel : sendLabel}
            title={disabled ? sendingLabel : sendLabel}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
