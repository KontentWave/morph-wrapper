import { mkdir, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";

import type { AppConfig, RepoCheckout } from "./types.js";
import { GitClient } from "./git-client.js";

export interface GitRunner {
  run(args: string[], cwd?: string): Promise<string>;
}

export class RepoCacheService {
  private readonly defaultBranchCache = new Map<string, string>();

  public constructor(
    private readonly config: AppConfig,
    private readonly gitClient: GitRunner = new GitClient({
      githubToken: config.githubToken,
    }),
  ) {}

  public async getDefaultBranch(repo: string): Promise<string> {
    const cached = this.defaultBranchCache.get(repo);
    if (cached) {
      return cached;
    }

    const output = await this.gitClient.run([
      "ls-remote",
      "--symref",
      this.getRemoteUrl(repo),
      "HEAD",
    ]);
    const match = output.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
    const branch = match?.[1] || "main";
    this.defaultBranchCache.set(repo, branch);
    return branch;
  }

  public async ensureCheckout(
    repo: string,
    branch: string,
  ): Promise<RepoCheckout> {
    const checkoutPath = join(
      this.config.repoCacheDir,
      sanitizeRepo(repo),
      sanitizeBranch(branch),
    );
    const remoteUrl = this.getRemoteUrl(repo);

    await mkdir(join(this.config.repoCacheDir, sanitizeRepo(repo)), {
      recursive: true,
    });

    if (!(await pathExists(join(checkoutPath, ".git")))) {
      await this.gitClient.run([
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        remoteUrl,
        checkoutPath,
      ]);
    } else {
      await this.gitClient.run(
        ["fetch", "origin", branch, "--depth", "1"],
        checkoutPath,
      );
      await this.gitClient.run(
        ["checkout", "-B", branch, `origin/${branch}`],
        checkoutPath,
      );
      await this.gitClient.run(
        ["reset", "--hard", `origin/${branch}`],
        checkoutPath,
      );
    }

    return { repo, branch, checkoutPath };
  }

  private getRemoteUrl(repo: string): string {
    return `https://github.com/${repo}.git`;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sanitizeRepo(repo: string): string {
  return repo.replaceAll("/", "__");
}

function sanitizeBranch(branch: string): string {
  return branch.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}
