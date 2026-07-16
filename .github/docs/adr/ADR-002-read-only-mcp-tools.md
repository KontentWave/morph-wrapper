# ADR-002: Expose Only Read-Only MCP Tools

## Status

Accepted

## Context

The project goal is repository inspection, not automation. Exposing mutation or execution tools would materially increase the security risk and violate the core product constraint.

## Decision

Expose exactly three MCP tools:

- `list_allowed_repos`
- `codebase_search`
- `read_file`

Do not expose tools for write, edit, delete, shell execution, git push, commit, pull request creation, or arbitrary local filesystem access.

## Consequences

Positive:

- narrow audit surface
- easier policy enforcement
- lower chance of accidental repository mutation

Negative:

- any future write workflow must be implemented in a separate, explicitly reviewed service rather than extending this server casually

## Follow-up

Add contract tests that assert the tool list is stable and contains no mutation surfaces.
