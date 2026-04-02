/**
 * Remark plugin that detects file-path patterns in text nodes and converts
 * them to markdown links so that the existing <a> override in
 * useMarkdownComponents can open them in the ArtifactPanel.
 *
 * Supported patterns:
 *   /absolute/path/to/file.ext
 *   ~/home-relative/path/file.ext
 *   C:\windows\path\file.ext  (or C:/windows/path/file.ext)
 *
 * Paths must contain at least one separator and end with a known extension
 * (or a path-like segment) to avoid false positives.
 */
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root, PhrasingContent } from "mdast";

/**
 * Regex breakdown:
 *   (?:^|(?<=[\s(["']))   — preceded by whitespace, open paren/bracket, or quote (or start of string)
 *   (                     — capture group 1: the path
 *     (?:                 — path prefix alternatives:
 *       ~\/               — home-relative ~/
 *       \/                — unix absolute /
 *       [A-Za-z]:[/\\]    — windows drive letter C:/ or C:\
 *     )
 *     [^\s"'`<>|;,(){}[\]]+ — path body: anything that isn't whitespace or delimiter chars
 *   )
 *
 * The pattern is applied globally; we post-filter for "looks like a real path"
 * (must contain at least one slash and end with an extension or directory-like segment).
 */
const FILE_PATH_PATTERN =
  /(?:^|(?<=[\s(["']))((~\/|\/|[A-Za-z]:[/\\])[^\s"'`<>|;,(){}[\]]+)/g;

/** Common extensions we want to linkify (superset of artifact-preview.ts). */
const KNOWN_EXTENSIONS = new Set([
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
  ".md",
  ".mdx",
  ".markdown",
  ".txt",
  ".log",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mp3",
  ".wav",
  ".ogg",
  ".opus",
  ".m4a",
  ".aac",
  ".flac",
  ".env",
  ".lock",
  ".cfg",
  ".ini",
  ".conf",
  ".dockerfile",
  ".gitignore",
  ".editorconfig",
]);

function hasKnownExtension(path: string): boolean {
  const clean = path.replace(/[.:]+$/, ""); // strip trailing punctuation
  const lastDot = clean.lastIndexOf(".");
  const lastSlash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  if (lastDot < 0 || lastDot < lastSlash) {
    return false;
  }
  const ext = clean.slice(lastDot).toLowerCase();
  return KNOWN_EXTENSIONS.has(ext);
}

function looksLikeFilePath(raw: string): boolean {
  // Must have at least one path separator beyond the prefix
  const withoutPrefix = raw.replace(/^(~\/|\/|[A-Za-z]:[/\\])/, "");
  if (!withoutPrefix) {
    return false;
  }
  // Must contain a slash or backslash (i.e. at least 2 segments)
  const hasSep = withoutPrefix.includes("/") || withoutPrefix.includes("\\");
  if (!hasSep && !hasKnownExtension(raw)) {
    return false;
  }
  // Strip common trailing punctuation from markdown prose
  const cleaned = raw.replace(/[.,:;!?)]+$/, "");
  return hasKnownExtension(cleaned) || hasSep;
}

function cleanTrailingPunctuation(raw: string): string {
  return raw.replace(/[.,:;!?)]+$/, "");
}

export function remarkFileLinks() {
  return (tree: Root) => {
    findAndReplace(tree, [
      FILE_PATH_PATTERN,
      (_match: string, fullPath: string): PhrasingContent | false => {
        if (!looksLikeFilePath(fullPath)) {
          return false;
        }
        const cleaned = cleanTrailingPunctuation(fullPath);
        return {
          type: "link",
          url: cleaned,
          children: [{ type: "text", value: cleaned }],
        };
      },
    ]);
  };
}
