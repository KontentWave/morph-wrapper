# Morph GitHub MCP Wrapper

Read-only MCP server that exposes safe GitHub repository inspection tools over HTTP and HTTPS-backed deployments.

This wrapper is designed to let ChatGPT inspect selected GitHub repositories and branches through a tightly scoped MCP surface backed by local cached checkouts and safe local search.

## Validated MVP

- HTTP MCP endpoint using the MCP TypeScript SDK v2 server APIs.
- Bearer-token gate in front of the MCP route.
- Allowlisted repository policy model.
- Isolated per-branch GitHub checkout cache.
- Read-only `list_allowed_repos`, `codebase_search`, and `read_file` tool registration.
- Secret/path filtering and bounded file reads.
- Local `ripgrep`-backed `codebase_search` against the cached repository checkout.
- Omitted-branch fallback to the repository's discovered default branch.
- External HTTPS tunnel validation with explicit host and origin allowlists.
- Automated test coverage for auth, repo cache behavior, repo policy, path policy, read access, and MCP tool contracts.

The `codebase_search` implementation is intentionally split behind a service boundary so the MCP tool contract stays stable while the underlying search backend evolves. The current implementation uses local `ripgrep` against the cached checkout path.

## Tool surface

- `list_allowed_repos`: list configured allowlisted repositories and their default branches.
- `codebase_search`: search an allowlisted repository branch through local `ripgrep` against the cached checkout.
- `read_file`: read a safe text file from an allowlisted repository branch.

The wrapper intentionally does not expose write, edit, delete, shell execution, or unrestricted filesystem tools.

## Project layout

- `src/index.ts`: HTTP entrypoint and MCP route mounting.
- `src/server.ts`: MCP tool registration.
- `src/config.ts`: environment parsing and allowlist loading.
- `src/repo-cache.ts`: GitHub clone/fetch checkout cache.
- `src/path-policy.ts`: path traversal and secret-file filtering.
- `src/search-service.ts`: stable search boundary with provider-backed local `ripgrep` implementation.
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

When `BIND_HOST` is anything other than `127.0.0.1`, `localhost`, or `::1`, you must also set explicit non-wildcard `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` values. This keeps non-local deployments from accepting arbitrary Host or Origin headers by accident.

`codebase_search` requires `ripgrep` (`rg`) to be installed and available on `PATH`.

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

For non-loopback or tunneled deployments, start the wrapper with explicit host and origin allowlists that match the public hostname.

## Validation status

- Build and automated tests pass.
- `npm audit` is clean after Morph SDK removal.
- Live smoke tests passed against representative public GitHub repositories.
- External HTTPS tunnel validation passed with bearer auth, host/origin enforcement, tool discovery, omitted-branch search, omitted-branch file reads, and rejection of blocked requests.

## Security notes

- `read_file` blocks secret-like paths including `.env*`, `.envrc`, private keys, `.netrc`, `.git-credentials`, `.aws/credentials`, `.kube/config`, and Terraform state files.
- External HTTP exposure is intentionally gated behind explicit host and origin allowlists.
- Only allowlisted repositories are accessible.
- No MCP tool can write files or execute shell commands.
