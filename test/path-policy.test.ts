import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AppError } from "../src/errors.js";
import {
  isBinaryBuffer,
  normalizeSafeRelativePath,
  resolveReadableFile,
} from "../src/path-policy.js";

test("normalizeSafeRelativePath rejects empty, absolute, traversal, and secret-like paths", () => {
  const cases = [
    { input: "   ", statusCode: 400, message: /File path is required/ },
    {
      input: "/etc/passwd",
      statusCode: 400,
      message: /Absolute paths are not allowed/,
    },
    {
      input: "../secrets.txt",
      statusCode: 400,
      message: /Path traversal is not allowed/,
    },
    {
      input: "config/.env.local",
      statusCode: 403,
      message: /blocked by path policy/,
    },
    {
      input: "keys/private.pem",
      statusCode: 403,
      message: /blocked by path policy/,
    },
    {
      input: "shell/.envrc",
      statusCode: 403,
      message: /blocked by path policy/,
    },
    {
      input: "auth/.netrc",
      statusCode: 403,
      message: /blocked by path policy/,
    },
    {
      input: "terraform.tfstate.backup",
      statusCode: 403,
      message: /blocked by path policy/,
    },
    {
      input: ".kube/config",
      statusCode: 403,
      message: /blocked by path policy/,
    },
  ];

  for (const entry of cases) {
    assert.throws(
      () => normalizeSafeRelativePath(entry.input),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, entry.statusCode);
        assert.match(error.message, entry.message);
        return true;
      },
    );
  }
});

test("normalizeSafeRelativePath normalizes separators and trims a leading dot slash", () => {
  assert.equal(
    normalizeSafeRelativePath(" ./src\\nested/file.ts "),
    "src/nested/file.ts",
  );
  assert.equal(normalizeSafeRelativePath("nested//file.ts"), "nested/file.ts");
});

test("resolveReadableFile rejects files outside the checkout, directories, and oversized files", async () => {
  const checkoutPath = await mkdtemp(join(tmpdir(), "morph-wrapper-policy-"));
  const nestedDir = join(checkoutPath, "src");
  const smallFile = join(nestedDir, "index.ts");
  const largeFile = join(checkoutPath, "large.txt");

  await mkdir(nestedDir, { recursive: true });
  await writeFile(smallFile, "export const value = 1;\n");
  await writeFile(largeFile, "x".repeat(20));

  await assert.rejects(
    () => resolveReadableFile(checkoutPath, "../outside.txt", 1024),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /escapes the repository checkout/);
      return true;
    },
  );

  await assert.rejects(
    () => resolveReadableFile(checkoutPath, "src", 1024),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /not a file/);
      return true;
    },
  );

  await assert.rejects(
    () => resolveReadableFile(checkoutPath, "large.txt", 8),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 413);
      assert.match(error.message, /exceeds 8 bytes/);
      return true;
    },
  );
});

test("isBinaryBuffer flags null-byte content and accepts plain text", () => {
  assert.equal(isBinaryBuffer(Buffer.from("plain text\n", "utf8")), false);
  assert.equal(isBinaryBuffer(Buffer.from([0x41, 0x00, 0x42])), true);
});
