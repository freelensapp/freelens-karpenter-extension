# Development process (spec-driven)

This repository is developed spec-first, as the other recent Freelens
extensions are. The process is binding for every contributor, human or coding
agent.

## The loop

1. **Spec before code.** Every feature starts as a spec in `docs/specs/`,
   numbered `SPEC-NNNN-short-slug.md` and written from
   [TEMPLATE.md](../specs/TEMPLATE.md). No implementation without an approved
   spec.
2. **Approval.** The lead maintainer approves the spec, in the pull request
   that introduces it or in its tracking issue, and its status becomes
   `Approved`.
3. **Implementation.** The pull request links the spec. If reality forces a
   change, the spec is updated in the same pull request and the change is
   called out in its description.
4. **Tests are part of the feature.** A feature without the tests its spec
   lists is not done. The test levels are in [TEMPLATE.md](../specs/TEMPLATE.md),
   the integration tests and the fixtures of each Karpenter variant in
   "Integration tests" of `AGENTS.md`.
5. **Docs in the same pull request.** [ROADMAP.md](ROADMAP.md), the status of
   the spec and `AGENTS.md` (when a pattern changed) change together with the
   code.
6. **Verification.** A spec becomes `Verified` when its tests are green on
   `main` and its manual checks, if any, are recorded in it.

## Spec statuses

`Draft`, `Approved`, `Implemented`, `Verified`. A replaced spec becomes
`Superseded` with a pointer to its replacement; nothing is deleted.

## The design question every spec answers

Freelens offers a standard vocabulary (list pages, detail drawers, menus).
This extension is an ad hoc dashboard over Karpenter's kinds and the host's
nodes, pods and events. Every spec states, for each task the user performs,
whether a standard view or the dashboard serves it best, and why.

## Manual testing escalation

What an agent cannot check by itself (a real EKS or AKS cluster, macOS and
Windows, the judgment of the visual result) is listed in the spec under
"Manual verification", with exact steps and expected outcomes. The maintainer
runs it, and the result (date, tester, outcome) is recorded in the spec
before it becomes `Verified`.

## Safety

- The extension is read-only: it writes nothing to a cluster. A write action
  needs a spec of its own and a confirmation that names the resource and the
  cluster.
- Development and tests use only a local kind cluster with the fixtures of
  `integration/fixtures/`. Every kubectl call names the kind context and none
  uses the current context of the user's kubeconfig, and Freelens dev is
  started for checks with a profile that syncs only the kind cluster's
  kubeconfig.

## Upstream drift watch

Karpenter releases often, and its providers follow. Before every release of
the extension, check the latest `kubernetes-sigs/karpenter`,
`aws/karpenter-provider-aws` and `Azure/karpenter-provider-azure` releases,
diff the CRD schemas against the versions the types were written from, and
record the reviewed versions in the specs involved.

## Working agreements

- Plain commit messages, no Conventional Commits prefix, no emoji.
- Pull requests against `main`, squash merge, CI green required.
