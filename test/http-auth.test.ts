import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createHttpApp } from "../src/index.js";
import type { AppConfig } from "../src/types.js";

function createConfig(): AppConfig {
  return {
    port: 0,
    bindHost: "127.0.0.1",
    authToken: "secret-token",
    morphApiKey: undefined,
    githubToken: undefined,
    repoCacheDir: "/tmp/morph-wrapper-test-cache",
    allowedRepos: [{ repo: "owner/repo", defaultBranch: "main" }],
    allowedHosts: undefined,
    allowedOrigins: undefined,
    maxFileBytes: 256_000,
    searchResultLimit: 10,
  };
}

test("MCP endpoint rejects missing and invalid bearer tokens", async (t) => {
  const { app, handler } = createHttpApp(createConfig());
  const server = app.listen(0, "127.0.0.1");

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await handler.close();
  });

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const missingToken = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingToken.status, 401);
  assert.deepEqual(await missingToken.json(), {
    error: "Missing bearer token.",
  });

  const invalidToken = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      authorization: "Bearer wrong-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(invalidToken.status, 403);
  assert.deepEqual(await invalidToken.json(), {
    error: "Invalid bearer token.",
  });
});

test("MCP endpoint accepts a valid bearer token and reaches the MCP handler", async (t) => {
  const { app, handler } = createHttpApp(createConfig());
  const server = app.listen(0, "127.0.0.1");

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await handler.close();
  });

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
    method: "POST",
    headers: {
      authorization: "Bearer secret-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 403);
});
