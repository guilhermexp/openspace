// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { getArtifactRenderKind } from "./ArtifactPanel";

describe("getArtifactRenderKind", () => {
  it("detects markdown, code, media, html, and plain text previews", () => {
    expect(getArtifactRenderKind("/tmp/readme.md")).toBe("markdown");
    expect(getArtifactRenderKind("/tmp/component.tsx")).toBe("code");
    expect(getArtifactRenderKind("/tmp/image.png")).toBe("image");
    expect(getArtifactRenderKind("/tmp/report.pdf")).toBe("pdf");
    expect(getArtifactRenderKind("/tmp/demo.mp4")).toBe("video");
    expect(getArtifactRenderKind("/tmp/index.html")).toBe("html");
    expect(getArtifactRenderKind("/tmp/notes.txt")).toBe("text");
  });
});
