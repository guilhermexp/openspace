// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Markdown from "react-markdown";
import { useMarkdownComponents } from "./useMarkdownComponents";

/** Test harness that renders markdown with our component overrides. */
function TestMarkdown({
  text,
  onOpenArtifact,
}: {
  text: string;
  onOpenArtifact?: (filePath: string) => void;
}) {
  const components = useMarkdownComponents({ onOpenArtifact });
  return (
    <div className="UiMarkdown">
      <Markdown components={components}>{text}</Markdown>
    </div>
  );
}

describe("useMarkdownComponents — file path detection in inline code", () => {
  afterEach(cleanup);

  it("makes a relative file path clickable", () => {
    const handler = vi.fn();
    render(<TestMarkdown text="Check `src/app.tsx` for details." onOpenArtifact={handler} />);
    const el = screen.getByTitle("Open src/app.tsx");
    expect(el).toBeTruthy();
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledWith("src/app.tsx");
  });

  it("makes an absolute file path clickable", () => {
    const handler = vi.fn();
    render(
      <TestMarkdown text="I edited `/Users/gui/project/main.ts`." onOpenArtifact={handler} />
    );
    const el = screen.getByTitle("Open /Users/gui/project/main.ts");
    expect(el).toBeTruthy();
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledWith("/Users/gui/project/main.ts");
  });

  it("makes a home-relative path clickable", () => {
    const handler = vi.fn();
    render(<TestMarkdown text="See `~/Documents/notes.md`." onOpenArtifact={handler} />);
    const el = screen.getByTitle("Open ~/Documents/notes.md");
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledWith("~/Documents/notes.md");
  });

  it("makes a dotfile clickable", () => {
    const handler = vi.fn();
    render(<TestMarkdown text="Edit `.gitignore` to fix it." onOpenArtifact={handler} />);
    const el = screen.getByTitle("Open .gitignore");
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledWith(".gitignore");
  });

  it("makes a directory path clickable", () => {
    const handler = vi.fn();
    render(
      <TestMarkdown text="Files are in `workspace/codeclaw/src/`." onOpenArtifact={handler} />
    );
    const el = screen.getByTitle("Open workspace/codeclaw/src/");
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledWith("workspace/codeclaw/src/");
  });

  it("strips line number suffix when opening", () => {
    const handler = vi.fn();
    render(<TestMarkdown text="Error at `src/index.ts:42`." onOpenArtifact={handler} />);
    const el = screen.getByTitle("Open src/index.ts");
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledWith("src/index.ts");
  });

  it("does NOT make regular inline code clickable", () => {
    const handler = vi.fn();
    render(<TestMarkdown text="Use `console.log` for debugging." onOpenArtifact={handler} />);
    const codeEl = screen.getByText("console.log");
    expect(codeEl.getAttribute("role")).not.toBe("button");
  });

  it("does NOT make file paths clickable without onOpenArtifact", () => {
    render(<TestMarkdown text="Check `src/app.tsx`." />);
    const codeEl = screen.getByText("src/app.tsx");
    expect(codeEl.getAttribute("role")).not.toBe("button");
  });
});
