import fsp from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileTextFromDisk } from "./file-reader";

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

  it("rejects files larger than 2MB", async () => {
    vi.mocked(fsp.stat).mockResolvedValue(
      { size: 2 * 1024 * 1024 + 1 } as Awaited<ReturnType<typeof fsp.stat>>
    );

    await expect(readFileTextFromDisk("/tmp/big.txt")).rejects.toThrow(/2MB/i);
    expect(fsp.readFile).not.toHaveBeenCalled();
  });

  it("rejects sensitive paths before reading from disk", async () => {
    await expect(readFileTextFromDisk("/etc/shadow")).rejects.toThrow(/restricted/i);
    expect(fsp.stat).not.toHaveBeenCalled();
    expect(fsp.readFile).not.toHaveBeenCalled();
  });
});
