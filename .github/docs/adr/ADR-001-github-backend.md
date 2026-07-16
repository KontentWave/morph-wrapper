# ADR-001: GitHub Backend Uses Isolated Branch Checkouts

## Status

Accepted

## Context

The wrapper must inspect only allowlisted GitHub repositories and support branch-aware reads and searches. It also needs a local cache so searches operate on a controlled filesystem surface instead of arbitrary host paths.

## Decision

Use GitHub as the only repository backend and maintain isolated local checkouts per `repo + branch` under a configured cache directory.

The cache service will:

- clone a requested repo branch on first use
- fetch updates for that branch on later requests
- reset the local branch to the fetched remote state
- keep each branch in its own cache path

## Consequences

Positive:

- simple isolation model without mutable shared working trees
- branch-specific reads and searches remain deterministic
- easy to reason about path safety because every tool operates inside a known checkout root

Negative:

- duplicate object storage across branch checkouts until the cache design is optimized
- branch refresh latency on the first request after a remote update

## Follow-up

If cache size becomes material, move from per-branch shallow clones to a shared mirror plus worktrees without changing the MCP tool contract.
