import React from "react";
import type { Components } from "react-markdown";
import { openExternal } from "@shared/utils/openExternal";
import { extractText } from "../utils/extractText";
import { CopyCodeButton } from "../components/CopyCodeButton";
import { resolveArtifactHrefToPath } from "../components/artifact-preview";

// ── File-path detection (inline code) ──────────────────────────────
// Matches: `src/app.tsx`, `./config.json`, `../utils.ts` (requires at least one /)
const FILE_PATH_RE = /^\.{0,2}\/?(?:[\w@.-]+\/)+[\w@.-]+\.\w{1,10}(?::\d+)?$/;
// Matches dotfiles: `.gitignore`, `.env.local`, `../.env`
const DOTFILE_RE = /^\.{0,2}\/?(?:[\w@.-]+\/)*\.[a-zA-Z][\w.-]*(?::\d+)?$/;
// Matches absolute paths: `/Users/name/project/file.ts`
const ABSOLUTE_FILE_PATH_RE =
  /^\/(?:[^/\0]+\/)*[^/\0]+\.\w{1,10}(?::\d+)?$/;
// Matches home-relative: `~/Documents/file.ts`
const HOME_FILE_PATH_RE =
  /^~\/(?:[^/\0]+\/)*[^/\0]+\.\w{1,10}(?::\d+)?$/;
// Matches directory paths: `src/components/`, `/Users/gui/project/`
const DIRECTORY_PATH_RE =
  /^(?:\.{0,2}\/|~\/|\/)?(?:[\w@.-]+\/)+$/;

function looksLikeFilePath(text: string): boolean {
  const t = text.trim();
  return (
    FILE_PATH_RE.test(t) ||
    DOTFILE_RE.test(t) ||
    ABSOLUTE_FILE_PATH_RE.test(t) ||
    HOME_FILE_PATH_RE.test(t) ||
    DIRECTORY_PATH_RE.test(t)
  );
}

/**
 * Stable markdown component overrides for the chat transcript.
 * Links open in the system browser; code blocks get a language tag and copy button.
 * Inline code that looks like a file path becomes a clickable artifact link.
 */
export function useMarkdownComponents(options?: {
  onOpenArtifact?: (filePath: string) => void | Promise<void>;
}): Components {
  return React.useMemo(
    () => ({
      a: ({ href, children, ...rest }) => (
        <a
          {...rest}
          href={href}
          onClick={(e) => {
            e.preventDefault();
            const artifactPath = resolveArtifactHrefToPath(href);
            if (artifactPath && options?.onOpenArtifact) {
              void options.onOpenArtifact(artifactPath);
              return;
            }
            if (href) {
              openExternal(href);
            }
          }}
        >
          {children}
        </a>
      ),
      code: ({ children, className, ...rest }) => {
        // Code blocks (inside <pre>) have a language-* class — leave them alone
        if (className && /language-/.test(className)) {
          return (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        }

        const codeText = typeof children === "string" ? children : String(children ?? "");

        // Multi-line content = code block without language tag, not inline code
        if (codeText.includes("\n") && codeText.length > 60) {
          return (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        }

        // Inline code that looks like a file path → clickable
        if (options?.onOpenArtifact && looksLikeFilePath(codeText)) {
          const pathOnly = codeText.trim().replace(/:\d+$/, "");
          return (
            <code
              {...rest}
              className="UiFilePathLink"
              role="button"
              onClick={() => void options.onOpenArtifact!(pathOnly)}
              title={`Open ${pathOnly}`}
            >
              {children}
              <svg
                className="UiFilePathLinkIcon"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </code>
          );
        }

        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
      pre: ({ children, ...rest }) => {
        let lang = "";
        const child = React.Children.toArray(children)[0];
        if (React.isValidElement(child) && child.props) {
          const className = (child.props as Record<string, unknown>).className;
          if (typeof className === "string") {
            const match = className.match(/language-(\S+)/);
            if (match) {
              lang = match[1];
            }
          }
        }
        const code = extractText(children).replace(/\n$/, "");
        return (
          <div className="UiMarkdownCodeBlock">
            {lang ? <span className="UiMarkdownCodeBlockLang">{lang}</span> : null}
            <CopyCodeButton code={code} />
            <pre {...rest}>{children}</pre>
          </div>
        );
      },
    }),
    [options?.onOpenArtifact]
  );
}
