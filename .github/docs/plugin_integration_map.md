# Plugin Integration Map

## Plugin dependency map

## Shared Piwigo hooks/events

## Shared database tables

## Shared config keys

## Shared services/includes

## Risky couplings

- Morph SDK dependency: `@morphllm/morphsdk` is now the concrete backend for `codebase_search` and requires `MORPH_API_KEY` at request time.
- Search backend contract: `src/search-service.ts` maps Morph WarpGrep `contexts` into MCP search matches, so SDK result-shape changes will directly affect user-visible search output.
- Audit status: `npm audit` currently reports high-severity transitive findings through Morph SDK tracing dependencies (`@traceloop/node-server-sdk`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-prometheus`) and a low-severity `diff` advisory with no direct fix available from the current SDK release.
- Runtime exposure note: the observed high-severity chain sits behind Morph's tracing initializer (`@morphllm/morphsdk/tracing`) and is not exercised by the current wrapper, which uses `MorphClient.warpGrep.execute(...)` only.

## Last inspection notes

- 2026-07-16: Repository is currently standalone and scaffold-only; no cross-plugin hooks or shared tables are present.
- 2026-07-16: Initial implementation plan depends on MCP SDK HTTP serving, GitHub-backed checkout cache, and a replaceable search backend seam for future Morph integration.
- 2026-07-16: `codebase_search` now uses Morph WarpGrep through `@morphllm/morphsdk` against the cached local checkout path.
- 2026-07-16: `npm audit` reports 31 vulnerabilities after adding Morph SDK; current wrapper usage does not import Morph tracing APIs, so the main high-severity findings appear dormant unless tracing is enabled upstream or in future code.
