import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { copyBundledCapabilitySourceDirs } from "../../../scripts/lib/openclaw-bundle-utils.mjs";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content = ""): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("copyBundledCapabilitySourceDirs", () => {
  it("copies bundled capability source dirs that have runtime surfaces but no plugin manifest", () => {
    const repoRoot = makeTempDir("openspace-openclaw-src-");
    const outDir = makeTempDir("openspace-openclaw-vendor-");

    writeFile(
      path.join(repoRoot, "extensions", "speech-core", "runtime-api.ts"),
      'export const speech = "ok";\n'
    );
    writeFile(
      path.join(repoRoot, "extensions", "speech-core", "src", "tts.ts"),
      'export const tts = "ok";\n'
    );
    writeFile(
      path.join(repoRoot, "extensions", "speech-core", "package.json"),
      '{ "name": "@openclaw/speech-core" }\n'
    );

    writeFile(
      path.join(repoRoot, "extensions", "browser", "runtime-api.ts"),
      'export const browser = "ok";\n'
    );
    writeFile(
      path.join(repoRoot, "extensions", "browser", "openclaw.plugin.json"),
      '{ "id": "browser" }\n'
    );

    writeFile(
      path.join(outDir, "dist", "extensions", "browser", "runtime-api.js"),
      'export const browser = "dist";\n'
    );

    const copied = copyBundledCapabilitySourceDirs({ repoRoot, outDir });

    expect(copied).toEqual(["speech-core"]);
    expect(fs.existsSync(path.join(outDir, "extensions", "speech-core", "runtime-api.ts"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outDir, "extensions", "speech-core", "src", "tts.ts"))).toBe(
      true
    );
    expect(fs.existsSync(path.join(outDir, "extensions", "browser"))).toBe(false);
  });
});
