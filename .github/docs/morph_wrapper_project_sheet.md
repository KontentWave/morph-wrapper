# Morph GitHub MCP Wrapper — project_sheet.md

## Goal

Build a read-only MCP server that allows ChatGPT to inspect selected GitHub repositories/branches using Morph/WarpGrep-style `codebase_search`.

The wrapper exposes only safe read/search tools. It must not expose write, edit, delete, shell execution, or unrestricted filesystem access.

## Scope

### In scope

- Remote HTTPS-accessible MCP server
- GitHub repository backend
- Allowlisted repositories only
- Branch-aware codebase search
- Read-only file access
- Morph/WarpGrep-powered semantic code search
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

Runs Morph/WarpGrep search against an allowed GitHub repo/branch.

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
→ Morph/WarpGrep `codebase_search`
→ sanitized results back to ChatGPT

## Repository cache behavior

- Clone allowlisted repos into local cache directory.
- Fetch updates on demand.
- Checkout requested branch in isolated worktree or safe cache path.
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

## Configuration

Use environment variables:

- `MCP_AUTH_TOKEN`
- `MORPH_API_KEY`
- `GITHUB_TOKEN`
- `REPO_CACHE_DIR`
- `ALLOWED_REPOS`
- `PORT`

Example:

```env
MCP_AUTH_TOKEN=change-me
MORPH_API_KEY=sk-...
GITHUB_TOKEN=github_pat_...
REPO_CACHE_DIR=/var/cache/morph-github-mcp
ALLOWED_REPOS=owner/repo-a,owner/repo-b
PORT=3000
```

## Acceptance checks

- `list_allowed_repos` returns only configured repos.
- `codebase_search` works on an allowed repo/branch.
- `codebase_search` rejects non-allowlisted repo.
- `read_file` reads normal source files.
- `read_file` rejects `.env`, keys, tokens, and path traversal.
- No MCP tool can write files or execute shell commands.
- Server works behind HTTPS tunnel or deployed HTTPS endpoint.

## Future considerations

- Optional local WSL backend for private experiments.
- Per-repo branch allowlists.
- Result caching to reduce Morph token usage.
- GitHub App authentication instead of personal token.
- Basic audit log for searched repos/branches.

Suggested ADRs:

.github/docs/adr/ADR-001-github-backend.md
.github/docs/adr/ADR-002-read-only-mcp-tools.md
.github/docs/adr/ADR-003-secret-and-path-filtering.md
