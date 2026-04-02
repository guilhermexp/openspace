import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { remarkFileLinks } from "../plugins/remarkFileLinks";
import { getDesktopApi } from "@ipc/desktopApi";
import { CopyCodeButton } from "./CopyCodeButton";
import { useArtifact } from "../context/ArtifactContext";
import { useMarkdownComponents } from "../hooks/useMarkdownComponents";
import {
  getArtifactFileName,
  getArtifactLanguageLabel,
  getArtifactRenderKind,
  toArtifactFileUrl,
} from "./artifact-preview";
import styles from "./ArtifactPanel.module.css";

export { getArtifactRenderKind } from "./artifact-preview";

function ArtifactContent() {
  const { filePath, fileContent } = useArtifact();
  const markdownComponents = useMarkdownComponents();

  if (!filePath) {
    return null;
  }

  const renderKind = getArtifactRenderKind(filePath);
  const fileUrl = toArtifactFileUrl(filePath);

  if (renderKind === "markdown") {
    return (
      <div className={`${styles.ArtifactContent} ${styles.ArtifactMarkdown}`}>
        <div className="UiChatText UiMarkdown">
          <Markdown
            remarkPlugins={[remarkGfm, remarkMath, remarkFileLinks]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {fileContent ?? ""}
          </Markdown>
        </div>
      </div>
    );
  }

  if (renderKind === "code") {
    return (
      <div className={styles.ArtifactContent}>
        <div className={styles.ArtifactCodeBlock}>
          <div className={styles.ArtifactCodeHeader}>
            <span className={styles.ArtifactCodeLanguage}>
              {getArtifactLanguageLabel(filePath)}
            </span>
            <CopyCodeButton code={fileContent ?? ""} />
          </div>
          <pre className={styles.ArtifactCodePre}>
            <code>{fileContent ?? ""}</code>
          </pre>
        </div>
      </div>
    );
  }

  if (renderKind === "image") {
    return (
      <div className={styles.ArtifactContent}>
        <div className={styles.ArtifactImageWrap}>
          <img src={fileUrl} alt={getArtifactFileName(filePath)} className={styles.ArtifactImage} />
        </div>
      </div>
    );
  }

  if (renderKind === "pdf") {
    return (
      <div className={styles.ArtifactContent}>
        <embed className={styles.ArtifactPdf} src={fileUrl} type="application/pdf" />
      </div>
    );
  }

  if (renderKind === "video") {
    return (
      <div className={styles.ArtifactContent}>
        <video className={styles.ArtifactVideo} controls src={fileUrl} />
      </div>
    );
  }

  if (renderKind === "audio") {
    return (
      <div className={styles.ArtifactContent}>
        <audio className={styles.ArtifactVideo} controls src={fileUrl} />
      </div>
    );
  }

  if (renderKind === "html") {
    return (
      <div className={styles.ArtifactContent}>
        <iframe
          className={styles.ArtifactHtml}
          srcDoc={fileContent ?? ""}
          sandbox="allow-scripts"
        />
      </div>
    );
  }

  return (
    <div className={styles.ArtifactContent}>
      <div className={styles.ArtifactState}>
        Preview is not available for this file type here.
        <button
          type="button"
          className={styles.ArtifactRetryButton}
          onClick={() => void getDesktopApi().openFileWith(filePath, "default")}
        >
          Open externally
        </button>
      </div>
    </div>
  );
}

export function ArtifactPanel() {
  const { filePath, panelWidth, loading, error, openArtifact, closeArtifact } = useArtifact();
  const [openMenu, setOpenMenu] = React.useState(false);
  const [openTargets, setOpenTargets] = React.useState<Array<{ id: string; label: string }>>([]);
  const [openTargetsLoading, setOpenTargetsLoading] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setOpenMenu(false);
  }, [filePath]);

  React.useEffect(() => {
    if (!openMenu) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        popoverRef.current &&
        !triggerRef.current.contains(target) &&
        !popoverRef.current.contains(target)
      ) {
        setOpenMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenu]);

  if (!filePath) {
    return null;
  }

  const resolvedFilePath = filePath;
  const fileName = getArtifactFileName(resolvedFilePath);

  async function handleToggleOpenMenu() {
    if (openMenu) {
      setOpenMenu(false);
      return;
    }
    setOpenMenu(true);
    setOpenTargetsLoading(true);
    const result = await getDesktopApi().listOpenTargets(resolvedFilePath);
    if ("targets" in result) {
      setOpenTargets(result.targets.map(({ id, label }) => ({ id, label })));
    } else {
      setOpenTargets([]);
    }
    setOpenTargetsLoading(false);
  }

  async function handleOpenWithTarget(targetId: string) {
    const result = await getDesktopApi().openFileWith(resolvedFilePath, targetId);
    if ("error" in result) {
      console.error("[artifact-panel] failed to open file", result.error);
      return;
    }
    setOpenMenu(false);
  }

  return (
    <aside className={styles.ArtifactPanel} style={{ width: `${panelWidth}px` }}>
      <header className={styles.ArtifactHeader}>
        <div className={styles.ArtifactTitleGroup}>
          <div className={styles.ArtifactFileName} title={fileName}>
            {fileName}
          </div>
          <div className={styles.ArtifactFilePath} title={resolvedFilePath}>
            {resolvedFilePath}
          </div>
        </div>

        <div className={styles.ArtifactHeaderActions}>
          <div className={styles.ArtifactOpenMenuWrap}>
            <button
              ref={triggerRef}
              type="button"
              className={styles.ArtifactIconButton}
              aria-label="Open file options"
              title="Open file options"
              aria-expanded={openMenu}
              aria-haspopup="true"
              onClick={() => void handleToggleOpenMenu()}
            >
              Open
            </button>
            {openMenu ? (
              <div ref={popoverRef} className={`UiPopover ${styles.ArtifactOpenMenu}`} role="menu">
                {openTargetsLoading ? (
                  <div className={styles.ArtifactOpenMenuState}>Loading...</div>
                ) : null}
                {!openTargetsLoading
                  ? openTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        role="menuitem"
                        className={styles.ArtifactOpenMenuItem}
                        onClick={() => void handleOpenWithTarget(target.id)}
                      >
                        {target.label}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.ArtifactIconButton}
            aria-label="Close preview"
            title="Close preview"
            onClick={closeArtifact}
          >
            X
          </button>
        </div>
      </header>

      {loading ? <div className={styles.ArtifactState}>Loading...</div> : null}
      {!loading && error ? (
        <div className={styles.ArtifactState}>
          <div>{error}</div>
          <button
            type="button"
            className={styles.ArtifactRetryButton}
            onClick={() => void openArtifact(resolvedFilePath)}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error ? <ArtifactContent /> : null}
    </aside>
  );
}
