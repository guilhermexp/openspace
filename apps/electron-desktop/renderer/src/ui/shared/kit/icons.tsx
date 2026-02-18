/**
 * Shared SVG icon components extracted from individual page files.
 * Centralised here to avoid duplication and make them easy to find.
 */
import React from "react";

/** Two-rectangle copy/duplicate icon (18×18). */
export function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M12 9.675V12.825C12 15.45 10.95 16.5 8.325 16.5H5.175C2.55 16.5 1.5 15.45 1.5 12.825V9.675C1.5 7.05 2.55 6 5.175 6H8.325C10.95 6 12 7.05 12 9.675Z"
        stroke="#8B8B8B"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 5.175V8.325C16.5 10.95 15.45 12 12.825 12H12V9.675C12 7.05 10.95 6 8.325 6H6V5.175C6 2.55 7.05 1.5 9.675 1.5H12.825C15.45 1.5 16.5 2.55 16.5 5.175Z"
        stroke="#8B8B8B"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Single checkmark icon (20×20, viewBox 24). */
export function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M19.1333 7L8.59292 17.6L5 13.9867"
        stroke="#8B8B8B"
        strokeOpacity="1"
        strokeWidth="2.06111"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Microphone icon for voice input button (20x20). */
export function MicrophoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 1.25C8.62 1.25 7.5 2.37 7.5 3.75V10C7.5 11.38 8.62 12.5 10 12.5C11.38 12.5 12.5 11.38 12.5 10V3.75C12.5 2.37 11.38 1.25 10 1.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.58 8.12V10C4.58 12.99 7.01 15.42 10 15.42C12.99 15.42 15.42 12.99 15.42 10V8.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 15.42V18.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Upward arrow icon used for the send button (20×20). */
export function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 15.5017L10 4.83171M10 4.83171L5.42711 9.4046M10 4.83171L14.5729 9.4046"
        stroke="currentColor"
        strokeWidth="1.5243"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
