export type ArtifactRenderKind = "markdown" | "code" | "image" | "pdf" | "video" | "html" | "text";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".css",
  ".scss",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".sql",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".cc",
  ".h",
  ".hpp",
  ".java",
  ".rb",
  ".swift",
  ".kt",
]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);

function normalizeExtension(filePath: string): string {
  const cleanPath = filePath.split(/[?#]/, 1)[0] ?? filePath;
  const lastDot = cleanPath.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }
  return cleanPath.slice(lastDot).toLowerCase();
}

export function getArtifactRenderKind(filePath: string): ArtifactRenderKind {
  const extension = normalizeExtension(filePath);
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return "markdown";
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (extension === ".pdf") {
    return "pdf";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (HTML_EXTENSIONS.has(extension)) {
    return "html";
  }
  return "text";
}

export function isBinaryArtifactPath(filePath: string): boolean {
  const kind = getArtifactRenderKind(filePath);
  return kind === "image" || kind === "pdf" || kind === "video";
}

export function getArtifactFileName(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? filePath;
}

export function getArtifactLanguageLabel(filePath: string): string {
  const extension = normalizeExtension(filePath).replace(/^\./, "");
  return extension || "text";
}

export function toArtifactFileUrl(filePath: string): string {
  if (filePath.startsWith("file://")) {
    return encodeURI(filePath);
  }
  const normalized = filePath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`);
  }
  if (normalized.startsWith("/")) {
    return encodeURI(`file://${normalized}`);
  }
  return encodeURI(`file:///${normalized.replace(/^\/+/, "")}`);
}

export function resolveArtifactHrefToPath(href?: string): string | null {
  if (!href) {
    return null;
  }
  if (href.startsWith("file://")) {
    const decoded = decodeURIComponent(href.replace(/^file:\/\//, ""));
    if (/^\/[a-zA-Z]:\//.test(decoded)) {
      return decoded.slice(1);
    }
    return decoded.startsWith("/") ? decoded : `/${decoded}`;
  }
  if (href.startsWith("/")) {
    return href;
  }
  if (/^[a-zA-Z]:[\\/]/.test(href)) {
    return href;
  }
  return null;
}

export function clampArtifactPanelWidth(width: number, containerWidth: number): number {
  const minWidth = 300;
  if (containerWidth <= 0) {
    return Math.max(minWidth, Math.round(width));
  }
  const maxByLayout = containerWidth - 400;
  const maxByPercent = Math.floor(containerWidth * 0.7);
  const maxWidth = Math.max(minWidth, Math.min(maxByLayout, maxByPercent));
  return Math.min(Math.max(Math.round(width), minWidth), maxWidth);
}
