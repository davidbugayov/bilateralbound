# Release marker

This repository is periodically tagged with **release markers** so it’s easy to rollback to a known-good state.

## What this release contains

- Direction selection stability fixes (no auto switching after pause).
- Noise reduction: removed temporary debug `console.log` output (kept warnings/errors).

## How to rollback

1. Fetch tags:

```bash
git fetch --tags --prune
```

2. Checkout this release tag (detached HEAD):

```bash
git checkout release-dev-2026-01-26-v2.39.32
```

3. (Optional) Create a rollback branch from the tag:

```bash
git checkout -b rollback/release-dev-2026-01-26-v2.39.32 release-dev-2026-01-26-v2.39.32
```

## Notes for automation / other AIs

- The tag points to a dedicated **release marker commit**. 
- Prefer rolling back by tag, not by guessing commit hashes.
