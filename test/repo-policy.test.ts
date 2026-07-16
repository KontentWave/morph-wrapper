import test from "node:test";
import assert from "node:assert/strict";

import { AppError } from "../src/errors.js";
import { resolveRepoTarget } from "../src/repo-policy.js";

test("resolveRepoTarget rejects branches outside the allowlist", () => {
  assert.throws(
    () =>
      resolveRepoTarget(
        [
          {
            repo: "owner/repo",
            allowedBranches: ["main", "release"],
          },
        ],
        "owner/repo",
        "feature",
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.match(error.message, /Branch feature is not allowed/);
      return true;
    },
  );
});

test("resolveRepoTarget falls back to the configured default branch", () => {
  const target = resolveRepoTarget(
    [
      {
        repo: "owner/repo",
        defaultBranch: "main",
        allowedBranches: ["main", "release"],
      },
    ],
    "owner/repo",
  );

  assert.equal(target.branch, "main");
});
