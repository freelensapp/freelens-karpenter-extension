# Proposed workflow changes

Written by the v2 port (step 6 of the migration issue), for a maintainer to
move into `.github/workflows/` in a commit of their own, as "Rules for the CI
agent" of the migration issue asks; then remove this directory.

| File | Change |
| --- | --- |
| `biome-migrate.yaml`, `check.yaml`, `npm-audit.yaml`, `npm-dedupe.yaml`, `npm-version.yaml`, `release.yaml`, `tag.yaml`, `trunk-check.yaml`, `trunk-upgrade.yaml` | replace: the template's, with the "Workflow summary" header of this repository brought up to date |
| `integration-tests.yaml` | replace: the template's, against Freelens `main`, with the static lab of SPEC-0002 (`e2e/scripts/lab-up.sh static`) in place of a bare kind cluster |
| `type-check.yaml`, `unit-tests.yaml`, `mise-lock-check.yaml` | add: the type check out of `check.yaml`, the unit tests, the check of `mise.lock` |
| `test-update.yaml` | **remove**: it updates `@freelensapp/extensions` to the `latest` dist-tag (1.x) and builds, which breaks with the exact v2 pin; Renovate now updates the pin together with the Freelens stack |
| `claude.yaml`, `claude-task.yaml` | add: the template's Claude Code workflows, as the other extensions have them (decision of 2026-10-16); they need the GitHub App "Claude" on the repository and the org-level `CLAUDE_CODE_OAUTH_TOKEN` secret |
| `osv-scanner.yaml` | keep as it is |
