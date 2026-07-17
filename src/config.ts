import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { AppError } from "./errors.js";
import type { AllowedRepoConfig, AppConfig } from "./types.js";

interface AllowedRepoObject {
  repo: string;
  defaultBranch?: string;
  allowedBranches?: string[];
  description?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const authToken = requireEnv(env.MCP_AUTH_TOKEN, "MCP_AUTH_TOKEN");
  const repoCacheDir = resolve(
    requireEnv(env.REPO_CACHE_DIR, "REPO_CACHE_DIR"),
  );
  const allowedRepos = parseAllowedRepos(
    requireEnv(env.ALLOWED_REPOS, "ALLOWED_REPOS"),
  );
  const bindHost = env.BIND_HOST?.trim() || "127.0.0.1";
  const allowedHosts = parseOptionalList(env.ALLOWED_HOSTS);
  const allowedOrigins = parseOptionalList(env.ALLOWED_ORIGINS);

  validateExposureControls(bindHost, allowedHosts, allowedOrigins);

  mkdirSync(repoCacheDir, { recursive: true });

  return {
    port: parseInteger(env.PORT, 3000),
    bindHost,
    authToken,
    githubToken: optionalTrim(env.GITHUB_TOKEN),
    repoCacheDir,
    allowedRepos,
    allowedHosts,
    allowedOrigins,
    maxFileBytes: parseInteger(env.MAX_FILE_BYTES, 256_000),
    searchResultLimit: parseInteger(env.SEARCH_RESULT_LIMIT, 10),
  };
}

function requireEnv(value: string | undefined, name: string): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new AppError(`Missing required environment variable ${name}.`, 500);
  }

  return trimmed;
}

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`Invalid numeric configuration value: ${value}`, 500);
  }

  return parsed;
}

function parseOptionalList(value: string | undefined): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function validateExposureControls(
  bindHost: string,
  allowedHosts: string[] | undefined,
  allowedOrigins: string[] | undefined,
): void {
  if (isLoopbackHost(bindHost)) {
    return;
  }

  if (!allowedHosts || allowedHosts.length === 0) {
    throw new AppError(
      "ALLOWED_HOSTS is required when BIND_HOST is not loopback.",
      500,
    );
  }

  if (!allowedOrigins || allowedOrigins.length === 0) {
    throw new AppError(
      "ALLOWED_ORIGINS is required when BIND_HOST is not loopback.",
      500,
    );
  }

  if (allowedHosts.includes("*") || allowedOrigins.includes("*")) {
    throw new AppError(
      "Wildcard ALLOWED_HOSTS and ALLOWED_ORIGINS are not permitted for non-loopback deployments.",
      500,
    );
  }
}

function isLoopbackHost(bindHost: string): boolean {
  return (
    bindHost === "127.0.0.1" || bindHost === "::1" || bindHost === "localhost"
  );
}

function parseAllowedRepos(raw: string): AllowedRepoConfig[] {
  const trimmed = raw.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as AllowedRepoObject[];
    return parsed.map(normalizeAllowedRepo);
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((repo) => normalizeAllowedRepo({ repo }));
}

function normalizeAllowedRepo(input: AllowedRepoObject): AllowedRepoConfig {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo)) {
    throw new AppError(
      `Invalid allowlisted repository name: ${input.repo}`,
      500,
    );
  }

  const allowedBranches = input.allowedBranches
    ?.map((branch) => branch.trim())
    .filter(Boolean);

  return {
    repo: input.repo,
    defaultBranch: input.defaultBranch?.trim() || undefined,
    allowedBranches:
      allowedBranches && allowedBranches.length > 0
        ? allowedBranches
        : undefined,
    description: input.description?.trim() || undefined,
  };
}
