# Plugin Integration Map

## Plugin dependency map

## Shared Piwigo hooks/events

## Shared database tables

## Shared config keys

## Shared services/includes

## Risky couplings

- Local search dependency: `codebase_search` now depends on `ripgrep` being installed on the host and available as `rg` on `PATH`.
- Search backend contract: `src/search-service.ts` ranks `rg --json` matches into the stable MCP search-match shape, so changes to ranking heuristics or ripgrep JSON output will directly affect user-visible search output.
- Query-quality boundary: search results now depend on local tokenization, stop-word filtering, and simple term-count scoring rather than Morph relevance ranking.
- Deployment boundary note: `src/config.ts` now rejects non-loopback binds unless explicit non-wildcard `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` are configured, so deployment manifests and reverse-proxy headers are coupled to that config contract.

## Last inspection notes

- 2026-07-17: Wrapper now includes an authenticated MCP HTTP entrypoint, isolated GitHub branch cache paths, local-ripgrep-backed `codebase_search`, and bounded `read_file` access.
- 2026-07-17: Automated tests currently cover MCP bearer auth, repo-cache clone/fetch/default-branch behavior, and branch allowlist enforcement.
- 2026-07-17: The Morph SDK runtime dependency was removed to satisfy zero-known-vulnerability deployment policy; search now runs through local `ripgrep` only.
- 2026-07-17: Additional hardening now covers `read_file` path-policy edge cases, `tools/list` contract stability, and non-loopback config validation for host/origin allowlists.
