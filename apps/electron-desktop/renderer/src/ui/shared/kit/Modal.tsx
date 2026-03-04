import React from "react";
import { CloseIcon } from "@shared/kit/icons";

/** Lightweight modal overlay with a centered card. */
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: string;
  "aria-label"?: string;
}) {
  // Close on Escape key
  React.useEffect(() => {
    if (!props.open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [props.open, props.onClose]);

  if (!props.open) {
    return null;
  }

  return (
    <div
      className="UiModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={props["aria-label"]}
      onClick={(e) => {
        // Close when clicking the backdrop (not the card itself)
        if (e.target === e.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className="UiModalCard">
        <div className="UiModalHeader">
          {props.header ? <div className="UiSectionTitle">{props.header}</div> : ""}
          <button className="UiModalClose" type="button" aria-label="Close" onClick={props.onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="UiModalContent scrollable">{props.children}</div>
      </div>
    </div>
  );
}
