# ADR-003: Enforce Secret and Path Filtering Before File Access

## Status

Accepted

## Context

The wrapper reads repository files from a local cache. Without explicit filtering, safe repository access could still expose secrets, environment files, private keys, dumps, binary blobs, or traversal outside the checkout root.

## Decision

Apply defense-in-depth checks before reading any file:

- reject absolute paths
- reject any path containing traversal segments
- normalize requested paths to POSIX-style relative paths
- deny secret-like filenames and extensions
- deny binary content
- deny files exceeding a configured size limit

## Consequences

Positive:

- strong default protection against accidental secret disclosure
- clear, testable policy boundary for file access

Negative:

- some legitimate files may be rejected until the allow/deny rules are tuned

## Follow-up

Expand the denylist with repository-specific patterns only when a justified need appears, and keep the defaults conservative.
