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
