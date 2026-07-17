import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SearchService } from "../src/search-service.js";

test("SearchService ranks files by matched query terms and hit count", async () => {
  const checkoutPath = await mkdtemp(
    join(tmpdir(), "morph-wrapper-search-service-"),
  );

  await mkdir(join(checkoutPath, "src"), { recursive: true });
  await writeFile(
    join(checkoutPath, "src", "auth.ts"),
    [
      "export function requireAuth(token: string) {",
      "  if (!token) throw new Error('missing token');",
      "  return validateAuthToken(token);",
      "}",
    ].join("\n"),
  );
  await writeFile(
    join(checkoutPath, "src", "logger.ts"),
    ["export function logRequest() {", "  console.log('request');", "}"].join(
      "\n",
    ),
  );

  const service = new SearchService(5);
  const matches = await service.search(checkoutPath, "find auth token");

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.path, "src/auth.ts");
  assert.equal(matches[0]?.startLine, 1);
  assert.equal(matches[0]?.endLine, 3);
  assert.equal(matches[0]?.confidence, "high");
});

test("SearchService ignores common stop words and returns no matches when nothing fits", async () => {
  const checkoutPath = await mkdtemp(
    join(tmpdir(), "morph-wrapper-search-service-empty-"),
  );

  await mkdir(join(checkoutPath, "src"), { recursive: true });
  await writeFile(
    join(checkoutPath, "src", "index.ts"),
    "export const value = 1;\n",
  );

  const service = new SearchService(5);
  const matches = await service.search(
    checkoutPath,
    "show the repository auth middleware",
  );

  assert.deepEqual(matches, []);
});

test("SearchService prefers path-specific implementation files over tests and helpers for broad queries", async () => {
  const checkoutPath = await mkdtemp(
    join(tmpdir(), "morph-wrapper-search-service-ranking-"),
  );

  await mkdir(join(checkoutPath, "src", "auth"), { recursive: true });
  await mkdir(join(checkoutPath, "src", "helpers"), { recursive: true });
  await mkdir(join(checkoutPath, "tests"), { recursive: true });

  await writeFile(
    join(checkoutPath, "src", "auth", "session-flow.ts"),
    [
      "export function buildSessionFlow(user: string) {",
      "  return authenticateSession(user);",
      "}",
    ].join("\n"),
  );
  await writeFile(
    join(checkoutPath, "src", "helpers", "index.ts"),
    [
      "export const authSessionFlowHelper = true;",
      "export const authSessionFlowFallback = true;",
      "export const authSessionFlowState = true;",
      "export const authSessionFlowStore = true;",
      "export const authSessionFlowAudit = true;",
    ].join("\n"),
  );
  await writeFile(
    join(checkoutPath, "tests", "session-flow.test.ts"),
    [
      "describe('session flow auth', () => {",
      "  it('tracks session flow auth state', () => {",
      "    expect('session flow auth').toBe('session flow auth');",
      "  });",
      "});",
    ].join("\n"),
  );

  const service = new SearchService(5);
  const matches = await service.search(checkoutPath, "session flow auth");

  assert.equal(matches[0]?.path, "src/auth/session-flow.ts");
  assert.equal(matches[1]?.path, "src/helpers/index.ts");
  assert.equal(matches[2]?.path, "tests/session-flow.test.ts");
});
