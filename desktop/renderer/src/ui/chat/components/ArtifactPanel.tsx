import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CopyCodeButton } from "./CopyCodeButton";
import { useArtifact } from "../context/ArtifactContext";
import { useMarkdownComponents } from "../hooks/useMarkdownComponents";
import {
  getArtifactFileName,
  getArtifactLanguageLabel,
  getArtifactRenderKind,
  toArtifactFileUrl,
} from "./artifact-preview";
import { openExternal } from "@shared/utils/openExternal";
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
            remarkPlugins={[remarkGfm, remarkMath]}
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
        <iframe className={styles.ArtifactHtml} srcDoc={fileContent ?? ""} sandbox="allow-scripts" />
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
          onClick={() => openExternal(fileUrl)}
        >
          Open externally
        </button>
      </div>
    </div>
  );
}

export function ArtifactPanel() {
  const { filePath, panelWidth, loading, error, openArtifact, closeArtifact } = useArtifact();

  if (!filePath) {
    return null;
  }

  const fileName = getArtifactFileName(filePath);

  return (
    <aside className={styles.ArtifactPanel} style={{ width: `${panelWidth}px` }}>
      <header className={styles.ArtifactHeader}>
        <div className={styles.ArtifactTitleGroup}>
          <div className={styles.ArtifactFileName} title={fileName}>
            {fileName}
          </div>
          <div className={styles.ArtifactFilePath} title={filePath}>
            {filePath}
          </div>
        </div>

        <div className={styles.ArtifactHeaderActions}>
          <button
            type="button"
            className={styles.ArtifactIconButton}
            aria-label="Open externally"
            title="Open externally"
            onClick={() => openExternal(toArtifactFileUrl(filePath))}
          >
            Open
          </button>
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
            onClick={() => void openArtifact(filePath)}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error ? <ArtifactContent /> : null}
    </aside>
  );
}
