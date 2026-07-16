import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RepoCacheService, type GitRunner } from "../src/repo-cache.js";
import type { AppConfig } from "../src/types.js";

function createConfig(repoCacheDir: string): AppConfig {
  return {
    port: 3000,
    bindHost: "127.0.0.1",
    authToken: "token",
    repoCacheDir,
    allowedRepos: [{ repo: "owner/repo", defaultBranch: "main" }],
    maxFileBytes: 256_000,
    searchResultLimit: 10,
  };
}

test("RepoCacheService clones a missing branch checkout", async () => {
  const repoCacheDir = await mkdtemp(join(tmpdir(), "morph-wrapper-cache-"));
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const gitRunner: GitRunner = {
    async run(args, cwd) {
      calls.push({ args, cwd });
      return "";
    },
  };

  const service = new RepoCacheService(createConfig(repoCacheDir), gitRunner);
  const checkout = await service.ensureCheckout("owner/repo", "main");

  assert.equal(checkout.repo, "owner/repo");
  assert.equal(checkout.branch, "main");
  assert.match(checkout.checkoutPath, /owner__repo\/main$/);
  assert.deepEqual(calls, [
    {
      args: [
        "clone",
        "--depth",
        "1",
        "--branch",
        "main",
        "https://github.com/owner/repo.git",
        checkout.checkoutPath,
      ],
      cwd: undefined,
    },
  ]);
});

test("RepoCacheService fetches and hard-resets an existing checkout", async () => {
  const repoCacheDir = await mkdtemp(join(tmpdir(), "morph-wrapper-cache-"));
  const checkoutPath = join(repoCacheDir, "owner__repo", "release");
  await mkdir(join(checkoutPath, ".git"), { recursive: true });

  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const gitRunner: GitRunner = {
    async run(args, cwd) {
      calls.push({ args, cwd });
      return "";
    },
  };

  const service = new RepoCacheService(createConfig(repoCacheDir), gitRunner);
  await service.ensureCheckout("owner/repo", "release");

  assert.deepEqual(calls, [
    {
      args: ["fetch", "origin", "release", "--depth", "1"],
      cwd: checkoutPath,
    },
    {
      args: ["checkout", "-B", "release", "origin/release"],
      cwd: checkoutPath,
    },
    {
      args: ["reset", "--hard", "origin/release"],
      cwd: checkoutPath,
    },
  ]);
});

test("RepoCacheService caches the discovered default branch", async () => {
  const repoCacheDir = await mkdtemp(join(tmpdir(), "morph-wrapper-cache-"));
  let callCount = 0;
  const gitRunner: GitRunner = {
    async run() {
      callCount += 1;
      return "ref: refs/heads/trunk HEAD\nabc123\tHEAD";
    },
  };

  const service = new RepoCacheService(createConfig(repoCacheDir), gitRunner);

  assert.equal(await service.getDefaultBranch("owner/repo"), "trunk");
  assert.equal(await service.getDefaultBranch("owner/repo"), "trunk");
  assert.equal(callCount, 1);
});
