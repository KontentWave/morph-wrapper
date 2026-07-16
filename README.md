# Morph GitHub MCP Wrapper

Initial scaffold for a read-only MCP server that exposes safe GitHub repository inspection tools over HTTP.

## Current scope of this scaffold

- HTTP MCP endpoint using the MCP TypeScript SDK v2 server APIs.
- Bearer-token gate in front of the MCP route.
- Allowlisted repository policy model.
- Isolated per-branch GitHub checkout cache.
- Read-only `list_allowed_repos`, `codebase_search`, and `read_file` tool registration.
- Secret/path filtering and bounded file reads.
- Morph WarpGrep-backed `codebase_search` against the cached repository checkout.

The `codebase_search` implementation is intentionally split behind a service boundary so the MCP tool contract stays stable while the underlying search backend evolves. The current implementation uses Morph WarpGrep against the local cached checkout path.

## Project layout

- `src/index.ts`: HTTP entrypoint and MCP route mounting.
- `src/server.ts`: MCP tool registration.
- `src/config.ts`: environment parsing and allowlist loading.
- `src/repo-cache.ts`: GitHub clone/fetch checkout cache.
- `src/path-policy.ts`: path traversal and secret-file filtering.
- `src/search-service.ts`: Morph WarpGrep-backed search adapter.
- `.github/docs/architecture.md`: minimal architecture plan.
- `.github/docs/adr/`: decision records for the main design constraints.

## Environment

Required:

- `MCP_AUTH_TOKEN`
- `REPO_CACHE_DIR`
- `ALLOWED_REPOS`

Optional:

- `GITHUB_TOKEN`
- `PORT`
- `BIND_HOST`
- `ALLOWED_HOSTS`
- `ALLOWED_ORIGINS`
- `MAX_FILE_BYTES`
- `SEARCH_RESULT_LIMIT`

Required for `codebase_search`:

- `MORPH_API_KEY`

`ALLOWED_REPOS` supports either a comma-separated list such as `owner/repo-a,owner/repo-b` or a JSON array of objects for richer metadata:

```json
[
  {
    "repo": "owner/repo-a",
    "defaultBranch": "main",
    "allowedBranches": ["main", "release"],
    "description": "Primary wrapper target"
  }
]
```

## Run

```bash
npm install
npm run build
npm run dev
```

The MCP endpoint is served at `POST /mcp`. A simple health endpoint is exposed at `GET /healthz`.
