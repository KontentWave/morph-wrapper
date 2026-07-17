# Architecture Plan

## Goal

Serve a read-only MCP endpoint over HTTPS-capable HTTP that lets an authenticated client inspect only allowlisted GitHub repositories and branches.

## Request flow

1. Client sends an MCP request to `/mcp` with a bearer token.
2. HTTP middleware validates the token before the request reaches the MCP handler.
3. The MCP server factory registers only three tools: `list_allowed_repos`, `codebase_search`, and `read_file`.
4. Tool handlers validate the repo against the allowlist and resolve the effective branch.
5. The repo cache service clones or refreshes a branch-specific local checkout.
6. The path policy filters secret-like or unsafe file paths before any file read.
7. Search and file results are returned as sanitized MCP tool output.

## Runtime boundaries

- HTTP boundary: MCP SDK HTTP handler plus bearer auth middleware.
- Policy boundary: allowlist validation and safe-path filtering.
- GitHub boundary: local checkout cache that can clone/fetch only configured repos.
- Search boundary: dedicated search service that invokes local `ripgrep` against the cached checkout without reshaping the MCP tool contract.

## Cache strategy

- One checkout directory per `repo + branch` under `REPO_CACHE_DIR`.
- Initial population uses shallow clone for the requested branch.
- Subsequent requests fetch only the requested branch and hard-reset the local branch to `origin/<branch>`.
- The cache is read by tools only; it is never exposed directly to MCP callers.

## Security baseline

- Only configured repositories are addressable.
- Only requested branches permitted by policy are addressable.
- `read_file` blocks path traversal, absolute paths, secret-like files, binaries, and oversized files.
- The MCP surface does not register write, edit, delete, exec, or arbitrary filesystem tools.
- Authentication is mandatory on the MCP route.
- Non-loopback deployments must set explicit `ALLOWED_HOSTS` and `ALLOWED_ORIGINS`; wildcard exposure is rejected at config load time.

## Current implementation notes

- `codebase_search` uses local `ripgrep` against the cached checkout path for the requested repo and branch.
- the current integration no longer depends on the Morph SDK; the remaining runtime dependency for search is that `rg` must be present on the server host.
- automated tests cover branch allowlist resolution, repo-cache clone/fetch/reset behavior, default-branch caching, and authenticated MCP route access
- automated tests now cover local search ranking and no-match behavior for `codebase_search`
- automated tests now cover `read_file`, path-policy edge cases, and a `tools/list` contract test for the exposed read-only tool set
- the remaining major gap is deployment-level HTTPS validation, plus ongoing repository-specific secret denylist tuning
