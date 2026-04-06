const githubOwner = import.meta.env.VITE_OPENSPACE_RELEASE_GITHUB_OWNER?.trim() ?? "";
const githubRepo = import.meta.env.VITE_OPENSPACE_RELEASE_GITHUB_REPO?.trim() ?? "";

function isConfiguredValue(value: string): boolean {
  return value.length > 0 && value !== "local";
}

export const releaseGithubOwner = isConfiguredValue(githubOwner) ? githubOwner : "";
export const releaseGithubRepo = isConfiguredValue(githubRepo) ? githubRepo : "";

export const releaseGithubRepoUrl =
  releaseGithubOwner && releaseGithubRepo
    ? `https://github.com/${releaseGithubOwner}/${releaseGithubRepo}`
    : "";
