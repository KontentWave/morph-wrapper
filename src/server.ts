import { readFile } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { AppConfig } from "./types.js";
import { RepoCacheService } from "./repo-cache.js";
import { SearchService } from "./search-service.js";
import {
  normalizeSafeRelativePath,
  resolveReadableFile,
  isBinaryBuffer,
} from "./path-policy.js";
import { resolveRepoTarget } from "./repo-policy.js";

interface ServerDependencies {
  config: AppConfig;
  repoCache: RepoCacheService;
  searchService: SearchService;
}

async function resolveToolTarget(
  config: AppConfig,
  repoCache: RepoCacheService,
  repo: string,
  branch?: string,
) {
  const requestedBranch = branch?.trim();

  if (requestedBranch) {
    return resolveRepoTarget(config.allowedRepos, repo, requestedBranch);
  }

  const defaultBranch = await repoCache.getDefaultBranch(repo);
  return resolveRepoTarget(config.allowedRepos, repo, defaultBranch);
}

export function createServer({
  config,
  repoCache,
  searchService,
}: ServerDependencies): McpServer {
  const server = new McpServer({
    name: "morph-github-mcp-wrapper",
    version: "0.1.0",
  });

  server.registerTool(
    "list_allowed_repos",
    {
      description:
        "List the GitHub repositories this wrapper is allowed to inspect.",
      inputSchema: z.object({}),
    },
    async () => {
      const repos = await Promise.all(
        config.allowedRepos.map(async (repo) => ({
          repo: repo.repo,
          defaultBranch:
            repo.defaultBranch || (await repoCache.getDefaultBranch(repo.repo)),
          allowedBranches: repo.allowedBranches ?? null,
          description: repo.description ?? null,
        })),
      );

      return textResult({ repositories: repos });
    },
  );

  server.registerTool(
    "codebase_search",
    {
      description:
        "Search an allowlisted repository branch using local ripgrep against the cached checkout.",
      inputSchema: z.object({
        repo: z.string().min(1),
        branch: z.string().min(1).optional(),
        query: z.string().min(3),
      }),
    },
    async ({ repo, branch, query }) => {
      const target = await resolveToolTarget(config, repoCache, repo, branch);
      const checkout = await repoCache.ensureCheckout(
        target.config.repo,
        target.branch,
      );
      const matches = await searchService.search(checkout.checkoutPath, query);

      return textResult({
        repo: checkout.repo,
        branch: checkout.branch,
        backend: "local-ripgrep",
        matches,
      });
    },
  );

  server.registerTool(
    "read_file",
    {
      description:
        "Read a safe text file from an allowlisted repository branch.",
      inputSchema: z.object({
        repo: z.string().min(1),
        branch: z.string().min(1).optional(),
        path: z.string().min(1),
        start_line: z.number().int().positive().optional(),
        end_line: z.number().int().positive().optional(),
      }),
    },
    async ({
      repo,
      branch,
      path,
      start_line: startLine,
      end_line: endLine,
    }) => {
      const target = await resolveToolTarget(config, repoCache, repo, branch);
      const checkout = await repoCache.ensureCheckout(
        target.config.repo,
        target.branch,
      );
      const relativePath = normalizeSafeRelativePath(path);
      const absolutePath = await resolveReadableFile(
        checkout.checkoutPath,
        relativePath,
        config.maxFileBytes,
      );
      const buffer = await readFile(absolutePath);

      if (isBinaryBuffer(buffer)) {
        throw new Error(`Requested file ${relativePath} appears to be binary.`);
      }

      const lines = buffer.toString("utf8").split(/\r?\n/);
      const sliceStart = Math.max((startLine ?? 1) - 1, 0);
      const sliceEnd = Math.min(endLine ?? lines.length, lines.length);

      if (sliceEnd < sliceStart + 1) {
        throw new Error("Invalid line range requested.");
      }

      return textResult({
        repo: checkout.repo,
        branch: checkout.branch,
        path: relativePath,
        startLine: sliceStart + 1,
        endLine: sliceEnd,
        content: lines.slice(sliceStart, sliceEnd).join("\n"),
      });
    },
  );

  return server;
}

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
