# Morph GitHub MCP Wrapper — project_sheet.md

## Goal

Build a read-only MCP server that allows ChatGPT to inspect selected GitHub repositories and branches using safe local `codebase_search` against cached checkouts.

The wrapper exposes only safe read/search tools. It must not expose write, edit, delete, shell execution, or unrestricted filesystem access.

## Scope

### In scope

- Remote HTTPS-accessible MCP server
- GitHub repository backend
- Allowlisted repositories only
- Branch-aware codebase search
- Read-only file access
- Local `ripgrep`-backed code search
- Basic authentication/token protection for MCP endpoint
- Secret/path filtering

### Out of scope

- Local WSL backend
- Code editing
- Git push/commit/PR creation
- Arbitrary shell commands
- Access to non-allowlisted repositories
- Production-grade multi-user SaaS

## Tools exposed to ChatGPT

### `list_allowed_repos`

Returns repositories ChatGPT is allowed to inspect.

Output:

- repo owner/name
- default branch
- allowed branches, if restricted
- short description

### `codebase_search`

Runs local `ripgrep` search against an allowed GitHub repo and branch.

Input:

- `repo`
- `branch`
- `query`

Rules:

- repo must be allowlisted
- branch must be valid
- search must run against local cached checkout of the GitHub repo
- no writes allowed

Output:

- relevant files
- line ranges
- short reason per file
- optional confidence notes

### `read_file`

Reads a safe file path from an allowed repo/branch.

Input:

- `repo`
- `branch`
- `path`
- optional `start_line`
- optional `end_line`

Rules:

- block path traversal
- block secrets and env files
- block binary/large files
- read-only

## Architecture

ChatGPT
→ HTTPS MCP endpoint
→ MCP wrapper
→ GitHub clone/fetch cache
→ local `ripgrep` `codebase_search`
→ sanitized results back to ChatGPT

## Current status

- authenticated MCP HTTP endpoint is implemented
- GitHub-backed per-branch cache paths are implemented
- local-ripgrep-backed `codebase_search` is implemented against the cached checkout path
- read-only `list_allowed_repos`, `codebase_search`, and `read_file` tools are implemented
- automated tests now cover MCP bearer auth, repo-cache clone/fetch/default-branch behavior, branch allowlist enforcement, local search ranking and no-match behavior, `read_file`, path-policy edge cases, and a `tools/list` contract test
- `codebase_search` and `read_file` now fall back to the repository's discovered default branch when callers omit `branch`
- `SearchService` remains the stable search boundary while local ripgrep now runs behind an internal provider implementation
- non-loopback deployment config now requires explicit non-wildcard `ALLOWED_HOSTS` and `ALLOWED_ORIGINS`
- Morph SDK was removed to satisfy zero-known-vulnerability deployment policy; `rg` on `PATH` is now the runtime prerequisite for `codebase_search`
- live smoke tests passed against `KontentWave/piwigo-2FA-cust-plugin`, `KontentWave/piwigo-owner-profile-plugin`, and `KontentWave/piwigo-community`
- local ranking now caps hit-volume dominance and de-prioritizes generic helper or test paths for broad queries
- external HTTPS tunnel validation passed with bearer auth, host/origin enforcement, tool discovery, and representative omitted-branch `codebase_search` and `read_file` calls
- remaining validation gap is live confirmation that the revised ranking behaves better on representative broad natural-language queries

## Repository cache behavior

- Clone allowlisted repos into local cache directory.
- Fetch updates on demand.
- Checkout requested branch in an isolated per-branch cache path.
- Prefer shallow fetch where practical.
- Never mutate remote repositories.

## Security rules

- Only allow configured GitHub repositories.
- Never expose `.env`, private keys, tokens, credentials, database dumps, or secret-like files.
- Reject paths containing `..`.
- Reject absolute paths.
- No shell execution exposed as an MCP tool.
- Logs must not contain secrets.
- MCP endpoint must require authentication unless used only in private tunnel testing.
- Non-loopback deployments must set explicit `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` values.

## Configuration

Use environment variables:

- `MCP_AUTH_TOKEN`
- `GITHUB_TOKEN`
- `REPO_CACHE_DIR`
- `ALLOWED_REPOS`
- `PORT`

Host runtime prerequisite:

- `rg` must be installed and available on `PATH`

Example:

```env
MCP_AUTH_TOKEN=change-me
GITHUB_TOKEN=github_pat_...
REPO_CACHE_DIR=/var/cache/morph-github-mcp
ALLOWED_REPOS=owner/repo-a,owner/repo-b
PORT=3000
```

## Acceptance checks

- `list_allowed_repos` returns only configured repos.
- `codebase_search` works on an allowed repo/branch.
- `codebase_search` and `read_file` fall back to the discovered default branch when `branch` is omitted.
- `codebase_search` rejects non-allowlisted repo.
- `codebase_search` returns useful ranked matches on representative repositories.
- `read_file` reads normal source files.
- `read_file` rejects `.env`, keys, tokens, and path traversal.
- No MCP tool can write files or execute shell commands.
- Server works behind HTTPS tunnel or deployed HTTPS endpoint.

## Live smoke findings

Smoke-tested on 2026-07-17 against public GitHub repositories:

- `KontentWave/piwigo-2FA-cust-plugin`
- `KontentWave/piwigo-owner-profile-plugin`
- `KontentWave/piwigo-community`

Observed behavior:

- `list_allowed_repos` returned all three repositories with discovered default branch `main`.
- omitted-branch `codebase_search` and `read_file` calls worked after adding default-branch fallback through the repo cache.
- narrow code-oriented queries such as `add photos upload` and `twofactor profile` returned relevant implementation files near the top.
- broader natural-language queries such as `owner profile user metadata` and `two factor authentication login code` initially showed ranking bias toward generic include files and tests; the local scorer now caps raw hit-volume influence and adds path-aware penalties and boosts to reduce that noise.
- `read_file` successfully read `main.inc.php` from `KontentWave/piwigo-community` on the discovered default branch.

## HTTPS deployment smoke checklist

Run this against the real external HTTPS endpoint or tunnel, not only local loopback.

- confirm the deployed endpoint is reachable over HTTPS
- confirm bearer auth rejects missing or invalid tokens and accepts the configured token
- confirm `initialize` succeeds through the external HTTPS path
- confirm `tools/list` returns only `list_allowed_repos`, `codebase_search`, and `read_file`
- confirm `list_allowed_repos` returns the configured allowlisted repositories
- confirm omitted-branch `codebase_search` works through the deployed path on a representative allowlisted repository
- confirm omitted-branch `read_file` works through the deployed path on a representative allowlisted repository
- confirm non-allowlisted repository requests are rejected
- confirm secret-like or traversal `read_file` paths are rejected
- confirm deployed `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` settings match the real hostname and caller origin
- confirm reverse proxy or tunnel headers do not break MCP request handling or response streaming behavior
- keep one successful external query/read transcript as release evidence

Status on 2026-07-17: passed through a Cloudflare quick tunnel using explicit non-loopback `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` settings. External checks confirmed missing-token rejection, invalid-token rejection, wrong-origin rejection, successful HTTPS `initialize`, correct `tools/list` output, allowlisted repo listing, omitted-branch `codebase_search`, omitted-branch `read_file`, and rejection of non-allowlisted or blocked-path requests.

## Recommended post-push checks

- Keep a small set of known-good and known-noisy live queries for regression checks as ranking changes.
- Re-run the representative live broad-query checks to confirm the new path-aware ranking reduces helper and test-file noise.
- Add or refine deployment notes if operators need an explicit reminder that `rg` is a required host dependency.
- Prefer a named tunnel or equivalent stable HTTPS deployment path before calling the wrapper production-ready beyond smoke-test use.

## Future considerations

- Per-repo branch allowlists.
- Result caching for repeated local searches.
- Keep `SearchService` as the stable boundary while moving concrete search backends behind provider-style internals.
- Preserve local ripgrep as the default production backend unless an alternate provider meets the same security and audit posture.
- Time-box a small Morph/WarpGrep provider experiment on a separate branch behind explicit opt-in configuration such as `SEARCH_BACKEND=morph`, while keeping `SEARCH_BACKEND=ripgrep` as the default validated MVP path.
- Keep a Morph-backed provider only if it materially improves known noisy broad natural-language queries without introducing unacceptable dependency or audit risk.
- Additional ranking refinements or a safer semantic search backend with an acceptable dependency posture.
- GitHub App authentication instead of personal token.
- Basic audit log for searched repos/branches.

Suggested ADRs:

.github/docs/adr/ADR-001-github-backend.md
.github/docs/adr/ADR-002-read-only-mcp-tools.md
.github/docs/adr/ADR-003-secret-and-path-filtering.md
