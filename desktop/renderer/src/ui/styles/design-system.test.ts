import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readUiStyleFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf-8");
}

describe("1Code visual port foundation", () => {
  it("defines the new global theme tokens in base.css", () => {
    const css = readUiStyleFile("./base.css");

    expect(css).toContain("--bg: #0a0a0a;");
    expect(css).toContain("--surface-primary: #121212;");
    expect(css).toContain("--lime: #0034ff;");
    expect(css).toContain("--font-body:");
    expect(css).toContain("--font-mono:");
  });

  it("keeps shared buttons driven by design tokens", () => {
    const css = readUiStyleFile("./kit/buttons.css");

    expect(css).toContain("background: var(--lime-soft);");
    expect(css).toMatch(/\.UiPrimaryButton[\s\S]*background: var\(--lime\);/);
    expect(css).toMatch(/\.UiPrimaryButton[\s\S]*color: #ffffff;/);
  });
});
