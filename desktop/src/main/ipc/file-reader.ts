import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { persistAudioFile, getCachedAudioPath } from "../audio-cache";
import type { FileReaderHandlerParams } from "./types";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024;

const TEXT_MIME_TYPES = new Map<string, string>([
  [".md", "text/markdown"],
  [".mdx", "text/markdown"],
  [".markdown", "text/markdown"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".txt", "text/plain"],
  [".log", "text/plain"],
  [".ts", "text/plain"],
  [".tsx", "text/plain"],
  [".js", "text/plain"],
  [".jsx", "text/plain"],
  [".mjs", "text/plain"],
  [".cjs", "text/plain"],
  [".py", "text/plain"],
  [".css", "text/plain"],
  [".scss", "text/plain"],
  [".json", "application/json"],
  [".yaml", "application/x-yaml"],
  [".yml", "application/x-yaml"],
  [".toml", "application/toml"],
  [".sh", "text/x-shellscript"],
  [".sql", "text/plain"],
  [".go", "text/plain"],
  [".rs", "text/plain"],
  [".c", "text/plain"],
  [".cpp", "text/plain"],
  [".cc", "text/plain"],
  [".h", "text/plain"],
  [".hpp", "text/plain"],
  [".java", "text/plain"],
  [".rb", "text/plain"],
  [".swift", "text/plain"],
  [".kt", "text/plain"],
]);

const BINARY_MIME_TYPES = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

function isPathInside(candidate: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function inferTextMimeType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_MIME_TYPES.get(extension) ?? null;
}

export function inferBinaryMimeType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  return BINARY_MIME_TYPES.get(extension) ?? null;
}

export function isRestrictedFilePath(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const homeDir = os.homedir();
  const restrictedRoots = [
    "/etc",
    "/private/etc",
    "/dev",
    "/proc",
    "/sys",
    path.join(homeDir, ".ssh"),
    path.join(homeDir, ".gnupg"),
    path.join(homeDir, ".aws"),
    path.join(homeDir, "Library", "Keychains"),
  ].map((entry) => path.resolve(entry));

  return restrictedRoots.some((restrictedRoot) => isPathInside(resolvedPath, restrictedRoot));
}

export function resolvePreviewFilePath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("A file path is required.");
  }

  if (trimmed.startsWith("file://")) {
    const decoded = decodeURIComponent(trimmed.replace(/^file:\/\//, ""));
    if (/^\/[a-zA-Z]:\//.test(decoded)) {
      return path.resolve(decoded.slice(1));
    }
    return path.resolve(decoded.startsWith("/") ? decoded : `/${decoded}`);
  }

  if (trimmed === "~") {
    return os.homedir();
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.resolve(path.join(os.homedir(), trimmed.slice(2)));
  }

  return path.resolve(trimmed);
}

export async function readFileTextFromDisk(filePath: string): Promise<{
  content: string;
  mimeType: string;
}> {
  const resolvedPath = resolvePreviewFilePath(filePath);
  if (isRestrictedFilePath(resolvedPath)) {
    throw new Error("Reading files from this restricted path is not allowed.");
  }

  const mimeType = inferTextMimeType(resolvedPath);
  if (!mimeType) {
    throw new Error("Unsupported file type for text preview.");
  }

  const stats = await fsp.stat(resolvedPath);
  if (stats.size > MAX_TEXT_FILE_BYTES) {
    throw new Error("File is larger than the 2MB preview limit.");
  }

  const content = await fsp.readFile(resolvedPath, "utf-8");
  return { content, mimeType };
}

export async function readFileDataUrlFromDisk(filePath: string): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  const resolvedPath = resolvePreviewFilePath(filePath);
  if (isRestrictedFilePath(resolvedPath)) {
    throw new Error("Reading files from this restricted path is not allowed.");
  }

  const mimeType = inferBinaryMimeType(resolvedPath);
  if (!mimeType) {
    throw new Error("Unsupported file type for binary preview.");
  }

  const stats = await fsp.stat(resolvedPath);
  if (stats.size > MAX_MEDIA_FILE_BYTES) {
    throw new Error("File is larger than the 25MB preview limit.");
  }

  const content = await fsp.readFile(resolvedPath);
  return { dataUrl: `data:${mimeType};base64,${content.toString("base64")}`, mimeType };
}

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".opus", ".m4a", ".aac"]);

function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function registerFileReaderHandlers({ userData }: FileReaderHandlerParams) {
  ipcMain.handle(IPC.resolveFilePath, async (_event, params: { filePath?: unknown }) => {
    const filePath = typeof params?.filePath === "string" ? params.filePath : "";
    try {
      return { path: resolvePreviewFilePath(filePath) };
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to resolve file path.";
      return { error: message };
    }
  });

  ipcMain.handle(IPC.readFileText, async (_event, params: { filePath?: unknown }) => {
    const filePath = typeof params?.filePath === "string" ? params.filePath.trim() : "";
    if (!filePath) {
      return { error: "A file path is required." };
    }

    try {
      return await readFileTextFromDisk(filePath);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to read file.";
      return { error: message };
    }
  });

  ipcMain.handle(IPC.readFileDataUrl, async (_event, params: { filePath?: unknown }) => {
    const filePath = typeof params?.filePath === "string" ? params.filePath.trim() : "";
    if (!filePath) {
      return { error: "A file path is required." };
    }

    try {
      const result = await readFileDataUrlFromDisk(filePath);
      // Persist audio files to durable cache so they survive /tmp cleanup
      if (isAudioFile(filePath)) {
        persistAudioFile(userData, resolvePreviewFilePath(filePath)).catch(() => {
          /* best-effort — don't block the response */
        });
      }
      return result;
    } catch (caughtError) {
      // Fallback: try the persistent audio cache when original file is gone
      if (isAudioFile(filePath)) {
        const cached = getCachedAudioPath(userData, resolvePreviewFilePath(filePath));
        if (cached) {
          try {
            return await readFileDataUrlFromDisk(cached);
          } catch {
            /* cache file also unreadable — fall through to original error */
          }
        }
      }
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to read binary file.";
      return { error: message };
    }
  });
}
