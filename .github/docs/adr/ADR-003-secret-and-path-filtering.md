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

Current status:

- path normalization, secret-like path filtering, binary detection, and file-size limits are implemented on the `read_file` path
- the default denylist now covers `.envrc`, `.netrc`, `.git-credentials`, `.kube/config`, and Terraform state files in addition to the earlier secret-like patterns

Still needed:

- repository-specific denylist expansion only when a justified need appears
