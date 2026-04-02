/**
 * Persistent audio cache.
 *
 * TTS audio files are initially written to `/tmp` by the gateway, which means
 * the OS can reclaim them at any moment.  This module copies audio files into
 * a durable cache directory (`{userData}/audio-cache/`) so the in-chat audio
 * player keeps working across restarts.
 *
 * Files older than `MAX_AGE_MS` (2 days) are pruned on every app launch.
 */
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const CACHE_DIR_NAME = "audio-cache";
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

function cacheDir(userData: string): string {
  return path.join(userData, CACHE_DIR_NAME);
}

/** Deterministic cache filename derived from the original absolute path. */
function cacheFileName(originalPath: string): string {
  const hash = crypto.createHash("sha256").update(originalPath).digest("hex").slice(0, 16);
  const ext = path.extname(originalPath) || ".mp3";
  return `${hash}${ext}`;
}

/**
 * Copy an audio file into the persistent cache (if not already cached).
 * Returns the cached file path.
 */
export async function persistAudioFile(userData: string, srcPath: string): Promise<string> {
  const dir = cacheDir(userData);
  await fsp.mkdir(dir, { recursive: true });

  const destName = cacheFileName(srcPath);
  const destPath = path.join(dir, destName);

  // Skip if already cached
  try {
    await fsp.access(destPath);
    return destPath;
  } catch {
    // not cached yet — continue
  }

  await fsp.copyFile(srcPath, destPath);
  return destPath;
}

/**
 * Look up a cached copy of an audio file.
 * Returns the cached path if it exists, null otherwise.
 */
export function getCachedAudioPath(userData: string, originalPath: string): string | null {
  const destPath = path.join(cacheDir(userData), cacheFileName(originalPath));
  return fs.existsSync(destPath) ? destPath : null;
}

/**
 * Remove cached audio files older than 2 days.
 * Safe to call on every app launch — non-fatal on errors.
 */
export async function cleanupAudioCache(userData: string): Promise<void> {
  const dir = cacheDir(userData);
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return; // directory doesn't exist yet — nothing to clean
  }

  const now = Date.now();
  await Promise.allSettled(
    entries.map(async (entry) => {
      const filePath = path.join(dir, entry);
      const stat = await fsp.stat(filePath);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        await fsp.unlink(filePath);
      }
    }),
  );
}
