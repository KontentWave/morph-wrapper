import { AppError } from "./errors.js";
import type { AllowedRepoConfig, ResolvedRepoTarget } from "./types.js";

export function resolveRepoTarget(
  allowedRepos: AllowedRepoConfig[],
  repoName: string,
  requestedBranch?: string,
): ResolvedRepoTarget {
  const repoConfig = allowedRepos.find(
    (candidate) => candidate.repo === repoName,
  );

  if (!repoConfig) {
    throw new AppError(`Repository ${repoName} is not allowlisted.`, 403);
  }

  const branch = resolveBranch(repoConfig, requestedBranch);
  return { config: repoConfig, branch };
}

function resolveBranch(
  repoConfig: AllowedRepoConfig,
  requestedBranch?: string,
): string {
  const branch =
    requestedBranch?.trim() ||
    repoConfig.defaultBranch ||
    repoConfig.allowedBranches?.[0];

  if (!branch) {
    throw new AppError(
      `No branch was provided for ${repoConfig.repo} and no default branch is configured.`,
      400,
    );
  }

  if (
    repoConfig.allowedBranches &&
    !repoConfig.allowedBranches.includes(branch)
  ) {
    throw new AppError(
      `Branch ${branch} is not allowed for ${repoConfig.repo}.`,
      403,
    );
  }

  return branch;
}
