import fsp from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import os from "node:os";

import {
  readFileDataUrlFromDisk,
  readFileTextFromDisk,
  resolvePreviewFilePath,
} from "./file-reader";

vi.mock("node:fs/promises", () => ({
  default: {
    stat: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe("readFileTextFromDisk", () => {
  beforeEach(() => {
    vi.mocked(fsp.stat).mockReset();
    vi.mocked(fsp.readFile).mockReset();
  });

  it("reads a supported text file and returns its mime type", async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ size: 128 } as Awaited<ReturnType<typeof fsp.stat>>);
    vi.mocked(fsp.readFile).mockResolvedValue("# hello");

    await expect(readFileTextFromDisk("/tmp/readme.md")).resolves.toEqual({
      content: "# hello",
      mimeType: "text/markdown",
    });
  });

  it("expands home-relative paths before reading", async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ size: 128 } as Awaited<ReturnType<typeof fsp.stat>>);
    vi.mocked(fsp.readFile).mockResolvedValue('{"ok":true}');

    await expect(readFileTextFromDisk("~/config.json")).resolves.toEqual({
      content: '{"ok":true}',
      mimeType: "application/json",
    });

    expect(fsp.stat).toHaveBeenCalledWith(`${os.homedir()}/config.json`);
    expect(fsp.readFile).toHaveBeenCalledWith(`${os.homedir()}/config.json`, "utf-8");
  });

  it("rejects files larger than 2MB", async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ size: 2 * 1024 * 1024 + 1 } as Awaited<
      ReturnType<typeof fsp.stat>
    >);

    await expect(readFileTextFromDisk("/tmp/big.txt")).rejects.toThrow(/2MB/i);
    expect(fsp.readFile).not.toHaveBeenCalled();
  });

  it("rejects sensitive paths before reading from disk", async () => {
    await expect(readFileTextFromDisk("/etc/shadow")).rejects.toThrow(/restricted/i);
    expect(fsp.stat).not.toHaveBeenCalled();
    expect(fsp.readFile).not.toHaveBeenCalled();
  });
});

describe("readFileDataUrlFromDisk", () => {
  beforeEach(() => {
    vi.mocked(fsp.stat).mockReset();
    vi.mocked(fsp.readFile).mockReset();
  });

  it("reads an image file and returns a data URL", async () => {
    vi.mocked(fsp.stat).mockResolvedValue({ size: 128 } as Awaited<ReturnType<typeof fsp.stat>>);
    vi.mocked(fsp.readFile).mockResolvedValue(Buffer.from("png-bytes"));

    await expect(readFileDataUrlFromDisk("/tmp/image.png")).resolves.toEqual({
      dataUrl: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`,
      mimeType: "image/png",
    });
  });

  it("rejects restricted paths before reading binary media", async () => {
    await expect(readFileDataUrlFromDisk("/etc/shadow")).rejects.toThrow(/restricted/i);
    expect(fsp.stat).not.toHaveBeenCalled();
    expect(fsp.readFile).not.toHaveBeenCalled();
  });
});

describe("resolvePreviewFilePath", () => {
  it("expands ~/ to the user home directory", () => {
    expect(resolvePreviewFilePath("~/Library/test.txt")).toBe(`${os.homedir()}/Library/test.txt`);
  });

  it("keeps absolute paths absolute", () => {
    expect(resolvePreviewFilePath("/tmp/readme.md")).toBe("/tmp/readme.md");
  });
});
