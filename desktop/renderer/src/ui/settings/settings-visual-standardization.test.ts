import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readSettingsFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf-8");
}

describe("settings visual standardization", () => {
  it("removes legacy iOS-blue styling from Other tab", () => {
    const css = readSettingsFile("./OtherTab.module.css");

    expect(css).not.toContain("#0a84ff");
  });

  it("keeps voice selection states neutral instead of blue-accented", () => {
    const css = readSettingsFile("./voice/VoiceRecognitionTab.module.css");

    expect(css).not.toContain("var(--lime-soft");
    expect(css).not.toContain("var(--lime,");
  });

  it("renders connectors with their own settings layout instead of skill cards", () => {
    const tsx = readSettingsFile("./connectors/ConnectorsTab.tsx");

    expect(tsx).toContain('import s from "./ConnectorsTab.module.css";');
    expect(tsx).not.toContain("UiSkillCard");
    expect(tsx).not.toContain("UiSkillsGrid");
    expect(tsx).not.toContain("FeatureCta");
  });
});
