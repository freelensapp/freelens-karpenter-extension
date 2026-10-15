# SPEC-NNNN: Title

- **Status:** Draft | Approved | Implemented | Verified | Superseded
- **Milestone:** `M<n>` (see [ROADMAP.md](../development/ROADMAP.md))
- **Karpenter versions reviewed:** `kubernetes-sigs/karpenter` `v<x.y.z>`, `aws/karpenter-provider-aws` `v<x.y.z>`, `Azure/karpenter-provider-azure` `v<x.y.z>`
- **Tracking issue:**
- **Author / date:**

## Goal

What the user can do when this is done, in one or two sentences.

## Upstream reference

The Karpenter concepts, API types and documentation pages the feature relates
to (links). The TypeScript types are written from the Go types of the
reviewed versions, not copied from other tools.

## Scope

What is included. What is explicitly excluded, and where it goes instead.

## Design

- **Standard or ad hoc view, and why** (see
  [PROCESS.md](../development/PROCESS.md), "The design question").
- Kinds and fields read, with the versions they come from.
- Freelens extension points used (pages, details, menus, stores).
- UI: layout, states (loading, empty, error, not installed), both themes.
- Safety: what the feature reads, what it writes (normally nothing).

## Tests (non-regression list)

- Unit: `<test file>`: `<cases>`
- Integration: `<what the harness asserts>`
- Functional (lab, Freelens dev over CDP): `<scenario>`
- Manual verification (if any): exact steps, expected outcome, and the
  recorded result (date, tester).

## Notes and deviations

Filled during implementation when reality diverges from the plan.
