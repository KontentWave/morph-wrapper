# Plugin Integration Map

## Plugin dependency map

- `KontentWave/piwigo-2FA-cust-plugin`: top live-search hits centered on `includes/functions.inc.php`, `includes/ws_functions.inc.php`, `class/twofactor.class.php`, and `js/tf_profile.js`.
- `KontentWave/piwigo-owner-profile-plugin`: top live-search hits centered on `include/functions.inc.php`, `tests/OwnerProfileTest.php`, `tests/bootstrap.php`, and `template/style.css`.
- `KontentWave/piwigo-community`: top live-search hits centered on `main.inc.php`, `add_photos.php`, `template/add_photos.tpl`, and `include/functions_community.inc.php`.

## Shared Piwigo hooks/events

## Shared database tables

## Shared config keys

## Shared services/includes

- Piwigo plugin implementations inspected here commonly concentrate behavior in `include` or `includes` helper files plus template assets, which makes file-level ranking sensitive to generic helper names.
- `KontentWave/piwigo-community` exposes plugin metadata and bootstrap wiring from `main.inc.php`, which was confirmed readable through the wrapper on the default branch.

## Risky couplings

- Local search dependency: `codebase_search` now depends on `ripgrep` being installed on the host and available as `rg` on `PATH`.
- Search backend contract: `src/search-service.ts` keeps the stable MCP search-match shape while delegating local `rg --json` execution through an internal provider, so backend swaps can stay behind the same boundary.
- Query-quality boundary: search results now depend on local tokenization, stop-word filtering, and simple term-count scoring rather than Morph relevance ranking.
- Broad natural-language ranking heuristic: the local scorer now caps hit-volume influence and adds boosts for implementation-like paths plus penalties for test or generic helper files, but this still needs live confirmation on representative repositories.
- Default-branch resolution path: omitted `branch` requests now depend on `RepoCacheService.getDefaultBranch()` before repo-policy validation, so live GitHub default-branch discovery is part of the read/search contract even when allowlist entries omit `defaultBranch`.
- Deployment boundary note: `src/config.ts` now rejects non-loopback binds unless explicit non-wildcard `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` are configured; the external Cloudflare tunnel smoke test passed only after the quick-tunnel hostname was allowlisted exactly and the matching HTTPS origin was configured.

## Last inspection notes

- 2026-07-17: Wrapper now includes an authenticated MCP HTTP entrypoint, isolated GitHub branch cache paths, local-ripgrep-backed `codebase_search`, and bounded `read_file` access.
- 2026-07-17: Automated tests currently cover MCP bearer auth, repo-cache clone/fetch/default-branch behavior, and branch allowlist enforcement.
- 2026-07-17: The Morph SDK runtime dependency was removed to satisfy zero-known-vulnerability deployment policy; search now runs through local `ripgrep` only.
- 2026-07-17: Additional hardening now covers `read_file` path-policy edge cases, `tools/list` contract stability, and non-loopback config validation for host/origin allowlists.
- 2026-07-17: Live smoke tests against three public Piwigo repositories confirmed omitted-branch fallback and showed that narrow code-oriented queries are useful while broader natural-language queries still produce some ranking noise.
- 2026-07-17: Search internals now keep `SearchService` stable while routing ripgrep through a provider-style implementation and applying path-aware ranking penalties and boosts.
- 2026-07-17: External HTTPS validation passed through a Cloudflare quick tunnel; missing-token, invalid-token, and wrong-origin requests were rejected, while authenticated MCP initialize, tool discovery, allowlisted search, and read operations succeeded.
