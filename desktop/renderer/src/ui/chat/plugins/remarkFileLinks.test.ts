import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { remarkFileLinks } from "./remarkFileLinks";

function process(md: string): string {
  const result = unified()
    .use(remarkParse)
    .use(remarkFileLinks)
    .use(remarkStringify)
    .processSync(md);
  return String(result).trim();
}

describe("remarkFileLinks", () => {
  it("converts an absolute path with known extension to a link", () => {
    const out = process("I created /Users/gui/project/src/app.tsx for you.");
    expect(out).toContain("[/Users/gui/project/src/app.tsx](/Users/gui/project/src/app.tsx)");
  });

  it("converts a home-relative path to a link", () => {
    const out = process("Check ~/Documents/notes.md please.");
    expect(out).toContain("[~/Documents/notes.md](~/Documents/notes.md)");
  });

  it("converts a path with multiple segments and known extension", () => {
    const out = process("Look at /etc/nginx/nginx.conf for details.");
    expect(out).toContain("[/etc/nginx/nginx.conf](/etc/nginx/nginx.conf)");
  });

  it("strips trailing punctuation from the path", () => {
    const out = process("I wrote /tmp/output.json.");
    expect(out).toContain("[/tmp/output.json](/tmp/output.json)");
  });

  it("does not linkify plain words starting with /", () => {
    const out = process("Use /help for more info.");
    expect(out).not.toContain("](/help)");
  });

  it("does not linkify URLs (they are already links via remarkGfm or raw text)", () => {
    // The plugin regex requires path prefix (/, ~/, C:/) so https:// won't match
    const out = process("Visit https://example.com/path/file.js for docs.");
    expect(out).not.toContain("[/path/file.js](/path/file.js)");
  });

  it("handles multiple paths in one line", () => {
    const out = process("Compare /src/a.ts and /src/b.ts.");
    expect(out).toContain("[/src/a.ts](/src/a.ts)");
    expect(out).toContain("[/src/b.ts](/src/b.ts)");
  });

  it("does not modify paths inside code blocks", () => {
    const out = process("```\n/Users/gui/src/app.tsx\n```");
    expect(out).not.toContain("](/Users/gui/src/app.tsx)");
  });

  it("does not modify paths inside inline code", () => {
    const out = process("Run `cat /Users/gui/src/app.tsx` to see it.");
    expect(out).not.toContain("](/Users/gui/src/app.tsx)");
  });

  it("handles Windows-style paths", () => {
    const out = process("Check C:/Users/gui/project/main.py for the fix.");
    expect(out).toContain("[C:/Users/gui/project/main.py](C:/Users/gui/project/main.py)");
  });
});
