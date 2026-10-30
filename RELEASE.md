# Release process

Publishing a new release involves an automated chain up to publication, followed
by a manual post-release version bump for ongoing development.

## Step 1 — Trigger: `Automated npm version`

Go to **Actions → Automated npm version → Run workflow** and choose the version
bump type:

| Input `newversion` | When to use                                |
| ------------------ | ------------------------------------------ |
| `patch`            | Bug fix (e.g. 1.2.3 → 1.2.4)               |
| `minor`            | New feature (e.g. 1.2.3 → 1.3.0)           |
| `major`            | Breaking change (e.g. 1.2.3 → 2.0.0)       |
| `prerelease`       | Pre-release preview (e.g. 1.2.3 → 1.2.4-0) |

The workflow opens a pull request `automated/npm-version` with the version bump
already applied to `package.json`.

## Step 2 — Review and merge the PR

Review the bump in `package.json`, then **merge the PR** into `main`.

The merge automatically triggers the `Automated tag` workflow, which:
- Reads the version from `package.json`.
- Creates tag `vX.Y.Z` on `main` (only if the version is a stable release, not a
  pre-release).

Alternatively, if the PR was closed without merging, you can post a `/tag`
comment on the corresponding issue to trigger tagging manually.

## Step 3 — Automatic: `Release`

Pushing the `vX.Y.Z` tag automatically triggers the `Release` workflow, which:
1. Verifies the tag matches the version in `package.json`.
2. Builds and packs the extension.
3. Publishes to npm with dist-tag `latest` (or `next` for pre-release versions
   containing a hyphen).
4. Creates a GitHub Release with the `.tgz`, its SPDX SBOM and a `.sha256`
   checksum of each attached; Freelens checks a tarball installed from a URL
   against the `.tgz.sha256` next to it.

## Step 4 — Manual: prepare next development version

After publishing the release, run **Automated npm version** manually with input
`prerelease` to open the PR for the next development cycle.

## Workflow chain

```text
[Maintainer] workflow_dispatch → Automated npm version
                                          │
                               (PR merged into main)
                                          ▼
                                   Automated tag  ◄── or: /tag comment
                                          │
                                 (tag v* pushed)
                                          ▼
                                       Release

[Maintainer] workflow_dispatch → Automated npm version (prerelease)
                                          │
                               (PR merged into main)
                                          ▼
                                next development version on main
```

## Pre-release checklist

Before starting the release, verify that the following workflows are green on
`main`:

- `Type check` — every TypeScript program, tests and tooling included.
- `Check` — build, lint, and Knip checks.
- `Unit tests` and `Trunk Check`.
- `Integration tests` — the extension installed in Freelens dev and every tab
  checked with each Karpenter variant.

## Versions and Freelens

The major version of the extension follows the major version of Freelens it
runs in: 2.x for Freelens 2 (the extension API v2, `engines.freelens`
`^2.0.0`), 1.x for Freelens 1, which is no longer released. The first release
for Freelens 2 is 2.0.0: from the prerelease `2.0.0-0` on `main`, run
**Automated npm version** with `patch`, which turns `2.0.0-0` into `2.0.0`.
