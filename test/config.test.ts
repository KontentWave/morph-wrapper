import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";

async function createEnv(overrides: Record<string, string | undefined> = {}) {
  const repoCacheDir = await mkdtemp(join(tmpdir(), "morph-wrapper-config-"));

  return {
    MCP_AUTH_TOKEN: "secret-token",
    REPO_CACHE_DIR: repoCacheDir,
    ALLOWED_REPOS: "owner/repo",
    ...overrides,
  };
}

test("loadConfig allows loopback binds without explicit host or origin allowlists", async () => {
  const config = loadConfig(await createEnv({ BIND_HOST: "127.0.0.1" }));

  assert.equal(config.bindHost, "127.0.0.1");
  assert.equal(config.allowedHosts, undefined);
  assert.equal(config.allowedOrigins, undefined);
});

test("loadConfig requires explicit host and origin allowlists for non-loopback binds", async () => {
  await assert.rejects(
    async () => loadConfig(await createEnv({ BIND_HOST: "0.0.0.0" })),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.match(error.message, /ALLOWED_HOSTS is required/);
      return true;
    },
  );

  await assert.rejects(
    async () =>
      loadConfig(
        await createEnv({
          BIND_HOST: "0.0.0.0",
          ALLOWED_HOSTS: "wrapper.example.com",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.match(error.message, /ALLOWED_ORIGINS is required/);
      return true;
    },
  );
});

test("loadConfig rejects wildcard host or origin allowlists on non-loopback binds", async () => {
  await assert.rejects(
    async () =>
      loadConfig(
        await createEnv({
          BIND_HOST: "0.0.0.0",
          ALLOWED_HOSTS: "*",
          ALLOWED_ORIGINS: "https://chat.example.com",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.match(error.message, /Wildcard ALLOWED_HOSTS/);
      return true;
    },
  );

  await assert.rejects(
    async () =>
      loadConfig(
        await createEnv({
          BIND_HOST: "0.0.0.0",
          ALLOWED_HOSTS: "wrapper.example.com",
          ALLOWED_ORIGINS: "*",
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.match(error.message, /Wildcard ALLOWED_HOSTS/);
      return true;
    },
  );
});

test("loadConfig accepts explicit host and origin allowlists for non-loopback binds", async () => {
  const config = loadConfig(
    await createEnv({
      BIND_HOST: "0.0.0.0",
      ALLOWED_HOSTS: "wrapper.example.com,api.example.com",
      ALLOWED_ORIGINS: "https://chat.example.com,https://ops.example.com",
    }),
  );

  assert.deepEqual(config.allowedHosts, [
    "wrapper.example.com",
    "api.example.com",
  ]);
  assert.deepEqual(config.allowedOrigins, [
    "https://chat.example.com",
    "https://ops.example.com",
  ]);
});
