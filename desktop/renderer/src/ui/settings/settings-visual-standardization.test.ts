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

  it("keeps messenger cards on the same neutral pattern as the rest of settings", () => {
    const tsx = readSettingsFile("./connectors/ConnectorsTab.tsx");
    const css = readSettingsFile("./connectors/ConnectorsTab.module.css");

    expect(tsx).not.toContain("ConnectorStatusBadge");
    expect(tsx).not.toContain("ConnectorAction--primary");
    expect(css).not.toContain(".ConnectorAction--primary");
  });

  it("renders skills in the same settings card language instead of legacy skill tiles", () => {
    const tsx = readSettingsFile("./skills/SkillsGrid.tsx");
    const css = readSettingsFile("./skills/SkillsIntegrationsTab.module.css");

    expect(tsx).not.toContain("FeatureCta");
    expect(tsx).not.toContain('className="UiSkillCard"');
    expect(tsx).not.toContain('className="UiSkillsGrid"');
    expect(tsx).not.toContain('className="UiProviderTileCheck"');
    expect(css).not.toContain("var(--lime)");
  });

  it("keeps ai models selectors and auth states neutral instead of color-coded", () => {
    const inlineApiKey = readSettingsFile("./account-models/InlineApiKey.tsx");
    const richSelectCss = readSettingsFile("./account-models/RichSelect.module.css");

    expect(inlineApiKey).not.toContain("#22c55e");
    expect(richSelectCss).not.toContain("#34c759");
    expect(richSelectCss).not.toContain("#4d9aff");
    expect(richSelectCss).not.toContain("#ffb300");
  });

  it("removes legacy OpenClaw wording from Other tab copy", () => {
    const tsx = readSettingsFile("./OtherTab.tsx");

    expect(tsx).not.toContain("OpenClaw");
  });
});
