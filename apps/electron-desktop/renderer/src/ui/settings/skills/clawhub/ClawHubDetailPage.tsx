import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import { useGatewayRpc } from "@gateway/context";
import { getDesktopApi, getDesktopApiOrNull } from "@ipc/desktopApi";
import { HeroPageLayout, ActionButton } from "@shared/kit";
import { addToast, addToastError } from "@shared/toast";
import { openExternal } from "@shared/utils/openExternal";
import type { GatewayState } from "@main/types";
import type {
  ClawHubSkillPackageDetail,
  ClawHubLlmDimension,
  ClawHubFileEntry,
  ClawHubComment,
} from "./useClawHubSkills";
import s from "./ClawHubDetailPage.module.css";

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatDate(timestamp: number) {
  if (!timestamp) return "Unknown";
  try {
    return new Date(timestamp).toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

function formatIsoDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Extension → color for the file type dot indicator
const EXT_COLORS: Record<string, string> = {
  md: "#519aba",
  mdx: "#519aba",
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f1e05a",
  jsx: "#f1e05a",
  mjs: "#f1e05a",
  json: "#e8a427",
  sh: "#89e051",
  bash: "#89e051",
  css: "#563d7c",
  html: "#e34c26",
  yaml: "#cb171e",
  yml: "#cb171e",
  toml: "#9c4221",
  py: "#3572a5",
  txt: "#9da5b4",
};

function getFileExt(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function getExtColor(ext: string): string {
  return EXT_COLORS[ext] ?? "#9da5b4";
}

type FileTreeDir = {
  name: string;
  files: ClawHubFileEntry[];
};

function groupFilesByDir(files: ClawHubFileEntry[]): {
  rootFiles: ClawHubFileEntry[];
  dirs: FileTreeDir[];
} {
  const dirMap = new Map<string, ClawHubFileEntry[]>();
  const rootFiles: ClawHubFileEntry[] = [];

  for (const file of files) {
    const lastSlash = file.path.lastIndexOf("/");
    if (lastSlash === -1) {
      rootFiles.push(file);
    } else {
      const dir = file.path.slice(0, lastSlash);
      const existing = dirMap.get(dir);
      if (existing) {
        existing.push(file);
      } else {
        dirMap.set(dir, [file]);
      }
    }
  }

  const dirs: FileTreeDir[] = [];
  for (const [name, dirFiles] of dirMap) {
    dirs.push({ name, files: dirFiles });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  return { rootFiles, dirs };
}

function clawhubFileUrl(slug: string, filePath: string): string {
  return `https://clawhub.com/skill/${encodeURIComponent(slug)}?file=${encodeURIComponent(filePath)}`;
}

const TEXT_CONTENT_TYPES = new Set([
  "text/markdown",
  "text/plain",
  "text/x-shellscript",
  "text/javascript",
  "text/typescript",
  "text/html",
  "text/css",
  "application/json",
  "application/x-yaml",
]);

function isTextFile(file: ClawHubFileEntry): boolean {
  if (file.contentType && TEXT_CONTENT_TYPES.has(file.contentType)) return true;
  const ext = getFileExt(file.path);
  return [
    "md",
    "mdx",
    "txt",
    "sh",
    "bash",
    "ts",
    "tsx",
    "js",
    "jsx",
    "mjs",
    "json",
    "yaml",
    "yml",
    "toml",
    "css",
    "html",
    "py",
    "rb",
    "rs",
  ].includes(ext);
}

function FileRow({ file, slug }: { file: ClawHubFileEntry; slug: string }) {
  const ext = getFileExt(file.path);
  const fileName = file.path.includes("/")
    ? file.path.slice(file.path.lastIndexOf("/") + 1)
    : file.path;
  const canExpand = isTextFile(file);
  const isMd = ext === "md" || ext === "mdx";

  const [expanded, setExpanded] = React.useState(false);
  const [content, setContent] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(false);

  const handleToggle = React.useCallback(() => {
    if (!canExpand) {
      openExternal(clawhubFileUrl(slug, file.path));
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (content !== null) return;
    setFetching(true);
    getDesktopApi()
      .clawhubGetSkillFile({ slug, path: file.path })
      .then((r) => {
        if (r.ok && r.content) setContent(r.content);
        else setContent("(failed to load)");
      })
      .catch(() => setContent("(failed to load)"))
      .finally(() => setFetching(false));
  }, [canExpand, expanded, content, slug, file.path]);

  const handleOpenExternal = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openExternal(clawhubFileUrl(slug, file.path));
    },
    [slug, file.path]
  );

  return (
    <div className={s.UiFileEntry}>
      <button
        type="button"
        className={s.UiFileRow}
        onClick={handleToggle}
        title={canExpand ? "Click to preview" : "Open on ClawHub"}
      >
        {canExpand ? (
          <span className={`${s.UiFileChevron} ${expanded ? s.UiFileChevronOpen : ""}`}>▸</span>
        ) : null}
        <span className={s.UiFileIcon} style={{ background: getExtColor(ext) }} />
        <span className={s.UiFileName}>{fileName}</span>
        <span className={s.UiFileMeta}>
          {ext ? <span className={s.UiFileExt}>.{ext}</span> : null}
          <span className={s.UiFileSize}>{formatFileSize(file.size)}</span>
        </span>
        <span
          className={s.UiFileLinkIcon}
          role="button"
          tabIndex={0}
          aria-label="Open on ClawHub"
          onClick={handleOpenExternal}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleOpenExternal(e as unknown as React.MouseEvent);
          }}
        >
          ↗
        </span>
      </button>
      {expanded ? (
        <div className={s.UiFileContent}>
          {fetching ? (
            <span className={s.UiFileContentLoading}>Loading…</span>
          ) : content !== null && isMd ? (
            <div className={`UiMarkdown ${s.UiFileContentMd}`}>
              <Markdown>{content}</Markdown>
            </div>
          ) : content !== null ? (
            <pre className={s.UiFileContentPre}>{content}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DirGroup({
  dir,
  slug,
  defaultOpen,
}: {
  dir: FileTreeDir;
  slug: string;
  defaultOpen: boolean;
}) {
  return (
    <details className={s.UiFileDirGroup} open={defaultOpen}>
      <summary className={s.UiFileDirHeader}>
        <span className={s.UiFileDirChevron}>▸</span>
        <span className={s.UiFileDirIcon}>📁</span>
        <span className={s.UiFileDirName}>{dir.name}/</span>
        <span className={s.UiFileDirCount}>{dir.files.length}</span>
      </summary>
      <div className={s.UiFileDirChildren}>
        {dir.files.map((f) => (
          <FileRow key={f.path} file={f} slug={slug} />
        ))}
      </div>
    </details>
  );
}

const VERDICT_COLORS: Record<string, { bg: string; text: string }> = {
  benign: { bg: "rgba(34, 197, 94, 0.12)", text: "rgba(34, 197, 94, 0.9)" },
  clean: { bg: "rgba(34, 197, 94, 0.12)", text: "rgba(34, 197, 94, 0.9)" },
  suspicious: { bg: "rgba(245, 158, 11, 0.12)", text: "rgba(245, 158, 11, 0.9)" },
  malicious: { bg: "rgba(239, 68, 68, 0.15)", text: "rgba(239, 68, 68, 0.9)" },
};

const DIMENSION_RATING_ICON: Record<string, string> = {
  ok: "✓",
  note: "ℹ",
  warn: "⚠",
  concern: "⚠",
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors = VERDICT_COLORS[verdict] ?? VERDICT_COLORS.suspicious;
  return (
    <span className={s.UiVerdictBadge} style={{ background: colors.bg, color: colors.text }}>
      {verdict}
    </span>
  );
}

function DimensionRow({ dim }: { dim: ClawHubLlmDimension }) {
  const icon = DIMENSION_RATING_ICON[dim.rating] ?? "•";
  const ratingClass =
    dim.rating === "ok" ? s.UiDimOk : dim.rating === "note" ? s.UiDimNote : s.UiDimWarn;

  return (
    <details className={s.UiDimRow}>
      <summary className={s.UiDimSummary}>
        <span className={`${s.UiDimIcon} ${ratingClass}`}>{icon}</span>
        <span className={s.UiDimLabel}>{dim.label}</span>
        <span className={`${s.UiDimRating} ${ratingClass}`}>{dim.rating}</span>
      </summary>
      <p className={s.UiDimDetail}>{dim.detail}</p>
    </details>
  );
}

function SkeletonBar({
  width,
  height = 14,
  className,
}: {
  width: string;
  height?: number;
  className?: string;
}) {
  return <span className={`${s.UiSkelBar} ${className ?? ""}`} style={{ width, height }} />;
}

function DetailSkeleton() {
  return (
    <div className={s.UiDetailLayout}>
      {/* Left column skeleton */}
      <div className={s.UiDetailMain}>
        <div className={s.UiDetailTitleRow}>
          <span className={s.UiSkelCircle} style={{ width: 36, height: 36 }} />
          <SkeletonBar width="40%" height={26} />
        </div>
        <SkeletonBar width="75%" height={14} className={s.UiSkelSpacerSm} />
        <div className={s.UiSkelRow}>
          <SkeletonBar width="90px" height={12} />
          <SkeletonBar width="60px" height={12} />
        </div>
        <div className={s.UiSkelRow}>
          <SkeletonBar width="60px" height={22} />
          <SkeletonBar width="50px" height={22} />
        </div>

        {/* Markdown area */}
        <div className={s.UiSkelMdBlock}>
          <SkeletonBar width="100%" height={14} />
          <SkeletonBar width="92%" height={14} />
          <SkeletonBar width="85%" height={14} />
          <SkeletonBar width="100%" height={14} />
          <SkeletonBar width="60%" height={14} />
          <SkeletonBar width="100%" height={14} />
          <SkeletonBar width="78%" height={14} />
          <SkeletonBar width="95%" height={14} />
          <SkeletonBar width="45%" height={14} />
        </div>

        {/* Section placeholder */}
        <div className={s.UiSkelSection}>
          <SkeletonBar width="130px" height={16} />
          <div className={s.UiSkelCardPlaceholder}>
            <SkeletonBar width="120px" height={14} />
            <SkeletonBar width="100%" height={12} />
            <SkeletonBar width="80%" height={12} />
          </div>
        </div>
      </div>

      {/* Sidebar skeleton */}
      <div className={s.UiDetailSidebar}>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="50px" height={12} />
          <SkeletonBar width="90px" height={18} />
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="55px" height={12} />
          <SkeletonBar width="80px" height={16} />
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="80px" height={28} className={s.UiSkelButton} />
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="65px" height={12} />
          <div className={s.UiSkelStatsGrid}>
            <div className={s.UiSkelStatItem}>
              <SkeletonBar width="36px" height={20} />
              <SkeletonBar width="32px" height={10} />
            </div>
            <div className={s.UiSkelStatItem}>
              <SkeletonBar width="36px" height={20} />
              <SkeletonBar width="48px" height={10} />
            </div>
            <div className={s.UiSkelStatItem}>
              <SkeletonBar width="36px" height={20} />
              <SkeletonBar width="38px" height={10} />
            </div>
          </div>
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="50px" height={12} />
          <div className={s.UiSkelRow}>
            <span className={s.UiSkelCircle} style={{ width: 24, height: 24 }} />
            <SkeletonBar width="100px" height={14} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClawHubDetailPage({
  state: _state,
}: {
  state: Extract<GatewayState, { kind: "ready" }>;
}) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const gw = useGatewayRpc();

  const [detail, setDetail] = React.useState<ClawHubSkillPackageDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);
  const [comments, setComments] = React.useState<ClawHubComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const api = getDesktopApi();

        const result = await api.clawhubGetSkillPackage({ slug });
        if (cancelled) return;
        if (!result.ok || !result.package) {
          setError(result.error ?? `Skill "${slug}" not found`);
          return;
        }
        setDetail(result.package as ClawHubSkillPackageDetail);

        const skillsList = await api.listCustomSkills();
        if (!cancelled) {
          setInstalled(skillsList.skills.some((sk) => sk.dirName === slug));
        }

        setCommentsLoading(true);
        api
          .clawhubGetComments({ slug, limit: 50 })
          .then((r) => {
            if (!cancelled && r.ok) setComments(r.comments);
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setCommentsLoading(false);
          });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleInstall = React.useCallback(async () => {
    if (!slug) return;
    setActionBusy(true);
    try {
      await gw.request("skills.install", { source: "clawhub", slug });
      addToast(`Installed "${slug}" from ClawHub`);
      setInstalled(true);
    } catch (err) {
      addToastError(err instanceof Error ? err.message : `Failed to install "${slug}"`);
    } finally {
      setActionBusy(false);
    }
  }, [slug, gw]);

  const handleRemove = React.useCallback(async () => {
    if (!slug) return;
    const api = getDesktopApiOrNull();
    if (!api?.removeCustomSkill) return;
    setActionBusy(true);
    try {
      const result = await api.removeCustomSkill(slug);
      if (!result.ok) throw new Error(result.error ?? "Failed to remove");
      addToast(`Removed "${slug}"`);
      setInstalled(false);
    } catch (err) {
      addToastError(err instanceof Error ? err.message : `Failed to remove "${slug}"`);
    } finally {
      setActionBusy(false);
    }
  }, [slug]);

  const ownerLabel = detail?.owner?.displayName || detail?.owner?.handle || null;
  const ownerImage = detail?.owner?.image ?? null;
  const version = detail?.latestVersion?.version;
  const versionDate = detail?.latestVersion?.createdAt
    ? formatDate(detail.latestVersion.createdAt)
    : null;

  return (
    <HeroPageLayout hideTopbar color="secondary" className={s.UiDetailShell + " scrollable"}>
      <div className={s.UiDetailWrapper}>
        <button type="button" className={s.UiDetailBack} onClick={() => navigate(-1)}>
          ← Back to Skills
        </button>

        {loading ? (
          <DetailSkeleton />
        ) : error ? (
          <div className={s.UiDetailError}>{error}</div>
        ) : detail ? (
          <>
            <div className={s.UiDetailLayout}>
              {/* ── Left column ── */}
              <div className={s.UiDetailMain}>
                <div className={s.UiDetailTitleRow}>
                  <span
                    className="UiSkillIcon"
                    aria-hidden="true"
                    style={{
                      background: "var(--surface-overlay-subtle)",
                      width: 36,
                      height: 36,
                      fontSize: 18,
                    }}
                  >
                    {detail.emoji || "🦞"}
                  </span>
                  <h1 className={s.UiDetailTitle}>{detail.displayName}</h1>
                  {detail.badges?.highlighted ? (
                    <span className={s.UiDetailFeatured}>FEATURED</span>
                  ) : null}
                </div>

                {detail.summary ? <p className={s.UiDetailSummary}>{detail.summary}</p> : null}

                <div className={s.UiDetailMeta}>
                  {ownerLabel ? <span>{ownerLabel}</span> : null}
                  {version ? <span>v{version}</span> : null}
                </div>

                {/* Badges */}
                <div className={s.UiDetailTags}>
                  {detail.badges?.official ? <span className={s.UiDetailTag}>Official</span> : null}
                  {detail.badges?.deprecated ? (
                    <span className={`${s.UiDetailTag} ${s["UiDetailTag--warn"]}`}>Deprecated</span>
                  ) : null}
                  {detail.license ? <span className={s.UiDetailTag}>{detail.license}</span> : null}
                  {detail.forkOf ? (
                    <span className={`${s.UiDetailTag} ${s["UiDetailTag--fork"]}`}>
                      {detail.forkOf.kind === "duplicate" ? "Duplicate" : "Fork"} of{" "}
                      {detail.forkOf.skillId}
                    </span>
                  ) : null}
                </div>

                {/* Security Analysis */}
                {detail.vtAnalysis || detail.llmAnalysis ? (
                  <div className={s.UiDetailSection}>
                    <h3 className={s.UiSectionHeading}>Security Analysis</h3>

                    {/* VirusTotal */}
                    {detail.vtAnalysis ? (
                      <div className={s.UiSecurityCard}>
                        <div className={s.UiSecurityCardHeader}>
                          <span className={s.UiSecurityCardTitle}>VirusTotal Scan</span>
                          <VerdictBadge verdict={detail.vtAnalysis.verdict} />
                        </div>
                        {detail.vtAnalysis.analysis ? (
                          <p className={s.UiSecurityCardText}>{detail.vtAnalysis.analysis}</p>
                        ) : null}
                        <div className={s.UiSecurityCardMeta}>
                          {detail.vtAnalysis.source ? (
                            <span>Source: {detail.vtAnalysis.source}</span>
                          ) : null}
                          <span>Checked: {formatDate(detail.vtAnalysis.checkedAt)}</span>
                        </div>
                      </div>
                    ) : null}

                    {/* LLM Analysis */}
                    {detail.llmAnalysis ? (
                      <div className={s.UiSecurityCard}>
                        <div className={s.UiSecurityCardHeader}>
                          <span className={s.UiSecurityCardTitle}>AI Security Review</span>
                          <VerdictBadge verdict={detail.llmAnalysis.verdict} />
                          <span className={s.UiConfidenceBadge}>
                            {detail.llmAnalysis.confidence} confidence
                          </span>
                        </div>
                        {detail.llmAnalysis.summary ? (
                          <p className={s.UiSecurityCardText}>{detail.llmAnalysis.summary}</p>
                        ) : null}
                        {detail.llmAnalysis.guidance ? (
                          <details className={s.UiGuidanceDetails}>
                            <summary className={s.UiGuidanceSummary}>Installation Guidance</summary>
                            <p className={s.UiGuidanceText}>{detail.llmAnalysis.guidance}</p>
                          </details>
                        ) : null}

                        {/* Dimensions */}
                        {detail.llmAnalysis.dimensions &&
                        detail.llmAnalysis.dimensions.length > 0 ? (
                          <div className={s.UiDimensions}>
                            {detail.llmAnalysis.dimensions.map((dim) => (
                              <DimensionRow key={dim.name} dim={dim} />
                            ))}
                          </div>
                        ) : null}

                        <div className={s.UiSecurityCardMeta}>
                          {detail.llmAnalysis.model ? (
                            <span>Model: {detail.llmAnalysis.model}</span>
                          ) : null}
                          <span>Checked: {formatDate(detail.llmAnalysis.checkedAt)}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Changelog */}
                {detail.latestVersion?.changelog ? (
                  <div className={s.UiDetailSection}>
                    <h3 className={s.UiSectionHeading}>Changelog</h3>
                    <p className={s.UiDetailSectionText}>{detail.latestVersion.changelog}</p>
                  </div>
                ) : null}
              </div>

              {/* ── Right sidebar ── */}
              <div className={s.UiDetailSidebar}>
                {/* Status */}
                <div className={s.UiSidebarSection}>
                  <div className={s.UiSidebarLabel}>Status</div>
                  <span className={installed ? s.UiStatusInstalled : s.UiStatusNotInstalled}>
                    {installed ? "✓ Installed" : "Not Installed"}
                  </span>
                </div>

                {/* Version */}
                {version ? (
                  <div className={s.UiSidebarSection}>
                    <div className={s.UiSidebarLabel}>Version</div>
                    <div className={s.UiSidebarValue}>
                      v{version}
                      {versionDate ? (
                        <span className={s.UiSidebarMuted}> · {versionDate}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Platforms */}
                {detail.platforms && detail.platforms.length > 0 ? (
                  <div className={s.UiSidebarSection}>
                    <div className={s.UiSidebarLabel}>Platforms</div>
                    <div className={s.UiSidebarPlatforms}>
                      {detail.platforms.map((p) => (
                        <span key={p} className={s.UiSidebarPlatformTag}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Actions */}
                <div className={s.UiSidebarSection}>
                  <div className={s.UiSidebarLabel}>Actions</div>
                  <ActionButton
                    variant="primary"
                    className={installed ? s.UiDangerBtn : ""}
                    loading={actionBusy}
                    onClick={() => {
                      if (installed) {
                        void handleRemove();
                      } else {
                        void handleInstall();
                      }
                    }}
                  >
                    {actionBusy
                      ? installed
                        ? "Removing"
                        : "Installing"
                      : installed
                        ? "Remove"
                        : "Install"}
                  </ActionButton>
                </div>

                {/* Stats */}
                <div className={s.UiSidebarSection}>
                  <div className={s.UiSidebarLabel}>Skill Info</div>
                  <div className={s.UiStatsGrid}>
                    <div className={s.UiStatItem}>
                      <span className={s.UiStatValue}>{formatCount(detail.stats?.stars ?? 0)}</span>
                      <span className={s.UiStatLabel}>Stars</span>
                    </div>
                    <div className={s.UiStatItem}>
                      <span className={s.UiStatValue}>
                        {formatCount(detail.stats?.downloads ?? 0)}
                      </span>
                      <span className={s.UiStatLabel}>Downloads</span>
                    </div>
                    <div className={s.UiStatItem}>
                      <span className={s.UiStatValue}>
                        {formatCount(detail.stats?.installsCurrent ?? 0)}
                      </span>
                      <span className={s.UiStatLabel}>Installs</span>
                    </div>
                  </div>
                  <div className={s.UiStatsExtraRow}>
                    <span className={s.UiStatsExtra}>
                      {detail.stats?.versions ?? 0} version
                      {(detail.stats?.versions ?? 0) !== 1 ? "s" : ""}
                    </span>
                    <span className={s.UiStatsExtra}>
                      {detail.stats?.comments ?? 0} comment
                      {(detail.stats?.comments ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Owner */}
                {ownerLabel ? (
                  <div className={s.UiSidebarSection}>
                    <div className={s.UiSidebarLabel}>Author</div>
                    <div className={s.UiOwnerRow}>
                      {ownerImage ? (
                        <img
                          src={ownerImage}
                          alt=""
                          className={s.UiOwnerAvatar}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={s.UiOwnerFallback} aria-hidden="true">
                          {(ownerLabel[0] ?? "?").toUpperCase()}
                        </div>
                      )}
                      <span className={s.UiOwnerName}>{ownerLabel}</span>
                    </div>
                  </div>
                ) : null}

                {/* Timestamps */}
                <div className={s.UiSidebarSection}>
                  <div className={s.UiSidebarLabel}>Dates</div>
                  <div className={s.UiDatesList}>
                    <div className={s.UiDateRow}>
                      <span className={s.UiDateLabel}>Created</span>
                      <span className={s.UiDateValue}>{formatDate(detail.createdAt)}</span>
                    </div>
                    <div className={s.UiDateRow}>
                      <span className={s.UiDateLabel}>Updated</span>
                      <span className={s.UiDateValue}>{formatDate(detail.updatedAt)}</span>
                    </div>
                    {detail.syncedAt ? (
                      <div className={s.UiDateRow}>
                        <span className={s.UiDateLabel}>Synced</span>
                        <span className={s.UiDateValue}>
                          {formatIsoDate(detail.syncedAt) ?? detail.syncedAt}
                        </span>
                      </div>
                    ) : null}
                    {detail.detailSyncedAt ? (
                      <div className={s.UiDateRow}>
                        <span className={s.UiDateLabel}>Detail sync</span>
                        <span className={s.UiDateValue}>
                          {formatIsoDate(detail.detailSyncedAt) ?? detail.detailSyncedAt}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Tags */}
                {detail.tags && Object.keys(detail.tags).length > 0 ? (
                  <div className={s.UiSidebarSection}>
                    <div className={s.UiSidebarLabel}>Tags</div>
                    <div className={s.UiTagsList}>
                      {Object.entries(detail.tags).map(([tag, ref]) => (
                        <div key={tag} className={s.UiTagRow}>
                          <span className={s.UiTagName}>{tag}</span>
                          <span className={s.UiTagRef} title={ref}>
                            {ref.length > 12 ? `${ref.slice(0, 12)}…` : ref}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* View source */}
                {detail.sourceId ? (
                  <div className={s.UiSidebarSection}>
                    <button
                      type="button"
                      className={s.UiViewSource}
                      onClick={() => openExternal(`https://clawhub.com/skill/${detail.slug}`)}
                    >
                      ↗ View Source (ClawHub)
                    </button>
                  </div>
                ) : null}

                {/* Moderation */}
                {detail.moderation ? (
                  <div className={s.UiSidebarSection}>
                    <div className={s.UiSidebarLabel}>Moderation</div>
                    <div className={s.UiModerationFlags}>
                      {detail.moderation.isMalwareBlocked ? (
                        <span className={s.UiModFlagDanger}>Malware blocked</span>
                      ) : null}
                      {detail.moderation.isSuspicious ? (
                        <span className={s.UiModFlagWarn}>Suspicious</span>
                      ) : null}
                      {detail.moderation.isHiddenByMod ? (
                        <span className={s.UiModFlagWarn}>Hidden by moderator</span>
                      ) : null}
                      {detail.moderation.isRemoved ? (
                        <span className={s.UiModFlagDanger}>Removed</span>
                      ) : null}
                      {detail.moderation.isPendingScan ? (
                        <span className={s.UiModFlagInfo}>Pending scan</span>
                      ) : null}
                      {!detail.moderation.isMalwareBlocked &&
                      !detail.moderation.isSuspicious &&
                      !detail.moderation.isHiddenByMod &&
                      !detail.moderation.isRemoved &&
                      !detail.moderation.isPendingScan ? (
                        <span className={s.UiModFlagOk}>Clean</span>
                      ) : null}
                    </div>
                    {detail.moderation.summary ? (
                      <p className={s.UiModerationSummary}>{detail.moderation.summary}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Files — full width */}
            {detail.files && detail.files.length > 0 && slug
              ? (() => {
                  const { rootFiles, dirs } = groupFilesByDir(detail.files);
                  return (
                    <div className={s.UiFullWidthSection}>
                      <h3 className={s.UiSectionHeading}>
                        Files
                        <span className={s.UiFileCount}>{detail.files.length}</span>
                      </h3>
                      <div className={s.UiFileTree}>
                        {rootFiles.length > 0 ? (
                          <div className={s.UiFileRootGroup}>
                            {rootFiles.map((f) => (
                              <FileRow key={f.path} file={f} slug={slug} />
                            ))}
                          </div>
                        ) : null}
                        {dirs.map((dir) => (
                          <DirGroup
                            key={dir.name}
                            dir={dir}
                            slug={slug}
                            defaultOpen={dirs.length <= 5}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()
              : null}

            {/* Comments — full width */}
            <div className={s.UiCommentsSection}>
              <h3 className={s.UiSectionHeading}>
                Comments
                {comments.length > 0 ? (
                  <span className={s.UiFileCount}>{comments.length}</span>
                ) : null}
              </h3>
              {commentsLoading ? (
                <p className={s.UiCommentsLoading}>Loading comments…</p>
              ) : comments.length === 0 ? (
                <p className={s.UiCommentsEmpty}>No comments yet</p>
              ) : (
                <div className={s.UiCommentsList}>
                  {comments.map((comment) => (
                    <div key={comment.id} className={s.UiCommentCard}>
                      <div className={s.UiCommentHeader}>
                        {comment.user.image ? (
                          <img
                            src={comment.user.image}
                            alt={comment.user.displayName}
                            className={s.UiCommentAvatar}
                          />
                        ) : (
                          <span className={s.UiCommentAvatarFallback}>
                            {(comment.user.displayName || comment.user.handle || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                        <div className={s.UiCommentAuthorInfo}>
                          <span className={s.UiCommentAuthor}>
                            {comment.user.displayName || comment.user.handle}
                          </span>
                          {comment.user.handle ? (
                            <button
                              type="button"
                              className={s.UiCommentHandle}
                              onClick={() =>
                                openExternal(
                                  `https://clawhub.com/u/${encodeURIComponent(comment.user.handle)}`
                                )
                              }
                            >
                              @{comment.user.handle}
                            </button>
                          ) : null}
                        </div>
                        <span className={s.UiCommentDate}>{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className={s.UiCommentBody}>{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </HeroPageLayout>
  );
}
