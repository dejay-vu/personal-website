export function getAdminGithubIds() {
  const configured =
    process.env.ADMIN_GITHUB_IDS ?? process.env.GITHUB_ID ?? '';

  return new Set(
    configured
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isAdminGithubId(githubId?: string | null) {
  if (!githubId) return false;

  return getAdminGithubIds().has(githubId);
}
