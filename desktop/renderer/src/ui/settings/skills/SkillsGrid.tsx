import sit from "./SkillsIntegrationsTab.module.css";
import type { SkillId, SkillStatus } from "./useSkillsStatus";
import { CustomSkillMenu } from "./CustomSkillMenu";
import type { CustomSkillMeta } from "./useCustomSkills";
import { SKILLS } from "./skillDefinitions";
import { filterSkillsForPlatform } from "./platformSkills";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import type { DesktopPlatform } from "./platformSkills";

export function SkillsGrid(props: {
  searchQuery: string;
  customSkills: CustomSkillMeta[];
  statuses: Record<SkillId, SkillStatus>;
  onOpenModal: (id: SkillId) => void;
  onRemoveCustomSkill: (dirName: string, name: string) => void;
}) {
  const { searchQuery, customSkills, statuses, onOpenModal, onRemoveCustomSkill } = props;

  const platform: DesktopPlatform = getDesktopApiOrNull()?.platform ?? "darwin";
  const availableSkills = filterSkillsForPlatform(SKILLS, platform);

  const q = searchQuery.trim().toLowerCase();
  const filteredCustom = q
    ? customSkills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    : customSkills;
  const filteredBuiltin = q
    ? availableSkills.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
    : availableSkills;
  const hasResults = filteredCustom.length > 0 || filteredBuiltin.length > 0;

  if (!hasResults) {
    return (
      <div className={sit.UiSkillsEmptyState}>
        <div className={sit.UiSkillsEmptyStateText}>
          No skills matching &quot;{searchQuery.trim()}&quot;
        </div>
      </div>
    );
  }

  const statusLabel = (status: SkillStatus): string | null => {
    switch (status) {
      case "connected":
        return "Connected";
      case "disabled":
        return "Disabled";
      case "coming-soon":
        return "Coming soon";
      default:
        return null;
    }
  };

  const actionLabel = (status: SkillStatus): string => {
    switch (status) {
      case "connected":
        return "Manage";
      case "disabled":
        return "Reconnect";
      default:
        return "Connect";
    }
  };

  const statusClassName = (status: SkillStatus): string =>
    status === "connected" ? `${sit.UiSkillMeta} ${sit["UiSkillMeta--connected"]}` : sit.UiSkillMeta;

  return (
    <div className={sit.UiSkillsScroll}>
      <div className={sit.UiSkillsList}>
        {/* Custom (user-installed) skill cards */}
        {filteredCustom.map((skill) => (
          <div
            key={`custom-${skill.dirName}`}
            className={sit.UiSkillCard}
            role="group"
            aria-label={skill.name}
          >
            <div className={sit.UiSkillCardMain}>
              <span
                className={`${sit.UiSkillIcon} ${sit["UiSkillIcon--custom"]}`}
                aria-hidden="true"
              >
                <span className={sit.UiSkillEmoji}>{skill.emoji}</span>
              </span>

              <div className={sit.UiSkillContent}>
                <div className={sit.UiSkillHeader}>
                  <div className={sit.UiSkillNameBlock}>
                    <div className={sit.UiSkillName}>{skill.name}</div>
                    <div className={sit.UiSkillMeta}>Custom skill</div>
                  </div>

                  <div className={sit.UiSkillTopRight}>
                    <CustomSkillMenu
                      onRemove={() => void onRemoveCustomSkill(skill.dirName, skill.name)}
                    />
                  </div>
                </div>
                <div className={sit.UiSkillDescription}>{skill.description}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Built-in skill cards */}
        {filteredBuiltin.map((skill) => {
          const status = statuses[skill.id];
          const isDisabled = status === "coming-soon";
          return (
            <div
              key={skill.id}
              className={`${sit.UiSkillCard}${status === "disabled" ? ` ${sit["UiSkillCard--disabled"]}` : ""}`}
              role="group"
              aria-label={skill.name}
            >
              <div className={sit.UiSkillCardMain}>
                <span className={sit.UiSkillIcon} aria-hidden="true">
                  {skill.image ? (
                    <img src={skill.image} alt="" />
                  ) : (
                    <span className={sit.UiSkillIconFallback}>{skill.iconText}</span>
                  )}
                </span>

                <div className={sit.UiSkillContent}>
                  <div className={sit.UiSkillHeader}>
                    <div className={sit.UiSkillNameBlock}>
                      <div className={sit.UiSkillName}>{skill.name}</div>
                      {statusLabel(status) ? (
                        <div className={statusClassName(status)}>{statusLabel(status)}</div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className={sit.UiSkillAction}
                      onClick={() => onOpenModal(skill.id)}
                      disabled={isDisabled}
                    >
                      {actionLabel(status)}
                    </button>
                  </div>
                  <div className={sit.UiSkillDescription}>{skill.description}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
