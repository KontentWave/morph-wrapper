# Follow-up Issue: Review Morph SDK Transitive Audit Findings

## Summary

Track the current `npm audit` findings introduced through `@morphllm/morphsdk` and decide whether the wrapper can keep the current dependency version, needs compensating controls, or should pin or replace the SDK path when upstream fixes land.

## Current context

- `npm audit` reports high-severity transitive findings through `@traceloop/node-server-sdk`, `@opentelemetry/sdk-node`, and `@opentelemetry/exporter-prometheus`
- `npm audit` also reports a low-severity `diff` advisory with no direct fix in the current Morph SDK dependency tree
- the wrapper currently uses `MorphClient.warpGrep.execute(...)` only and does not import Morph tracing APIs
- the observed high-severity chain appears to sit behind `@morphllm/morphsdk/tracing`, so the present runtime exposure looks lower than the raw advisory count suggests

## Questions to resolve

- Does a newer Morph SDK release remove or reduce the vulnerable transitive chain?
- Can the tracing-related packages be excluded or tree-shaken more explicitly in production builds?
- Are there any code paths in this wrapper or its hosting environment that could activate tracing transitively?
- Does deployment policy need an explicit dependency exception record until upstream publishes a fix?

## Acceptance criteria

- confirm the exact vulnerable packages and advisory IDs from a fresh `npm audit`
- compare the current SDK version with the latest available release notes or changelog
- document whether the current wrapper imports any tracing entrypoints directly or indirectly
- record a decision: upgrade, accept temporarily with rationale, or replace the dependency path
- update `.github/docs/plugin_integration_map.md` after the review with the final status
