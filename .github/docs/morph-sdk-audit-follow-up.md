# Follow-up Issue: Review Morph SDK Transitive Audit Findings

## Summary

This follow-up is resolved by removal rather than risk acceptance. The wrapper no longer depends on `@morphllm/morphsdk`; `codebase_search` now uses local `ripgrep` against the cached checkout, so the Morph SDK audit chain is no longer part of the product dependency graph.

## Current context

- the prior audited dependency was `@morphllm/morphsdk@0.2.191`
- the wrapper now uses local `ripgrep` in `src/search-service.ts` and no longer imports any Morph SDK entrypoint
- `codebase_search` still operates on the same cached checkout path and preserves the MCP tool contract
- a fresh `npm audit` must be used to confirm the Morph dependency chain is fully gone from the installed tree after lockfile sync

## Prior audit snapshot

The relevant chains from the 2026-07-17 audit output before removal were:

- high or moderate tracing chain: `@morphllm/morphsdk` -> `@traceloop/node-server-sdk@0.27.0` -> `@opentelemetry/sdk-node@0.203.0` -> `@opentelemetry/exporter-prometheus@0.203.0`
- high or moderate tracing chain: `@morphllm/morphsdk` -> `@opentelemetry/exporter-trace-otlp-http@0.203.0` -> `@opentelemetry/core`, `@opentelemetry/otlp-exporter-base`, `@opentelemetry/otlp-transformer`, `@opentelemetry/sdk-trace-base`
- moderate side chain under tracing dependencies: `@traceloop/node-server-sdk` -> `@traceloop/instrumentation-vertexai` -> `google-gax@4.6.1` -> `retry-request@7.0.2` -> `teeny-request@9.0.0` -> `uuid@9.0.1`, plus `gaxios@6.7.1` -> `uuid@9.0.1`
- low-severity SDK utility chain: `@morphllm/morphsdk` -> `diff@7.0.0`

## Resolution

- `src/search-service.ts` now shells out to local `rg --json` and ranks matches in-process.
- `package.json` no longer declares `@morphllm/morphsdk`.
- after `npm install`, `package-lock.json` and `node_modules` should drop the Morph SDK and its transitive OpenTelemetry, Traceloop, `diff`, and Google client subtrees.
- this removes the need for a deployment exception tied to non-reachable Morph tracing packages.

## Operational tradeoff

- The wrapper now depends on `ripgrep` being installed on the host.
- Search relevance is simpler than Morph WarpGrep; ranking now comes from local tokenization, stop-word filtering, hit counts, and line-range aggregation.
- This is the chosen tradeoff for environments that require zero known vulnerabilities in the shipped dependency tree.

## Validation targets

- confirm `package-lock.json` no longer contains `@morphllm/morphsdk`
- confirm `npm audit` no longer reports the prior Morph SDK findings
- keep build and test coverage green after the local search substitution

## Questions to resolve

- resolved: the zero-vulnerability path is to remove the Morph SDK dependency entirely
- resolved: the replacement backend is local `ripgrep`, not an alternate hosted search SDK
- resolved: deployment no longer needs a Morph-specific risk exception once the dependency tree is refreshed and audit is clean

## Acceptance criteria

- the prior vulnerable Morph dependency chain remains documented for history
- the current implementation no longer depends on the Morph SDK
- fresh install and audit validation should confirm the old findings are gone
- `.github/docs/plugin_integration_map.md` and `.github/docs/architecture.md` should reflect the final local-search architecture
