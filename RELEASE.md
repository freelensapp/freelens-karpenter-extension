# Release process

Publishing a new release involves a single manual trigger that starts an
automated chain across multiple workflows.

## Step 1 — Trigger: `Automated npm version`

Go to **Actions → Automated npm version → Run workflow** and choose the version
bump type:

| Input `newversion` | When to use |
| --- | --- |
| `patch` | Bug fix (e.g. 1.2.3 → 1.2.4) |
| `minor` | New feature (e.g. 1.2.3 → 1.3.0) |
| `major` | Breaking change (e.g. 1.2.3 → 2.0.0) |
| `prerelease` | Pre-release preview (e.g. 1.2.3 → 1.2.4-0) |

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
4. Creates a GitHub Release with the generated `.tgz` attached.

## Step 4 — Automatic: next `Automated npm version`

The creation of the GitHub Release triggers `Automated npm version` again with
input `prerelease`, opening the PR for the next development version.

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
                                          │
                              (GitHub "released" event)
                                          ▼
                             Automated npm version (prerelease)
```

## Pre-release checklist

Before starting the release, verify that the following workflows are green on
`main`:

- `Check` — type, lint, and Knip checks.
- `Integration tests` — end-to-end validation against Freelens.
- `Test update` — build compatibility with the latest `@freelensapp/extensions`.
- `OSV-Scanner` and `Automated npm audit` — no outstanding critical
  vulnerabilities.
