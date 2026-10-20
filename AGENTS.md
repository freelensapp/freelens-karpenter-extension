# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

> **Tip**: If you find yourself correcting the agent during interactive work, suggest adding a new rule to this file so the lesson is captured for future sessions.

## Project Overview

This repository is the Freelens extension for [Karpenter](https://karpenter.sh/).
It adds one cluster page, "Karpenter", with four tabs (Overview, Topology, Node
Classes, Scaling Decisions), and a Karpenter section to the host's Node
details. It reads the Karpenter objects, the nodes, the pods and the events of
the cluster, and writes nothing to it.

The build, type-check, test and release setup is the one of
freelensapp/freelens-example-extension, the reference template for Freelens
extensions, file for file (`build/`, `environment-tests/`, the `tsconfig`s,
`vite.config.mjs`, `vitest.config.ts`, `biome.jsonc`, `knip.jsonc`,
`pnpm-workspace.yaml`, `.renovaterc.json`). The sections of this file that
describe it follow the template's `AGENTS.md`; a change to that setup starts
there, and is copied here.

- **Language**: TypeScript 7.x
- **Runtime**: Freelens >= 2.0.0 (extension API v2)
- **Kubernetes APIs**: `karpenter.sh/v1` (NodePool, NodeClaim) and
  `karpenter.sh/v1alpha1` (NodeOverlay) of kubernetes-sigs/karpenter,
  `karpenter.k8s.aws/v1` (EC2NodeClass) of aws/karpenter-provider-aws,
  `karpenter.azure.com/v1beta1` and `v1alpha2` (AKSNodeClass) of
  Azure/karpenter-provider-azure; the types follow Karpenter 1.15.0, the AWS
  provider 1.15.0 and the Azure provider 1.14.5
- **Toolchain**: Node.js 24.x, yq 4.x and cosign 3.x (`mise.toml` with
  `mise.lock`; Node also in `.nvmrc`)
- **Package manager**: pnpm 12.x (`packageManager`, run through corepack)
- **License**: MIT

Library and tool versions follow the Freelens stack exactly: the catalog in
Freelens's `pnpm-workspace.yaml` for libraries, the root `package.json` scripts
of Freelens for tools run with `pnpm dlx` (Biome, knip, Trunk launcher), and
Freelens's `mise.toml` and `.nvmrc` for Node and the other mise tools.
Renovate keeps them there: custom datasources in `.renovaterc.json` read the
versions from the same Freelens files on `main`, so an update arrives only once
Freelens has adopted it, at that version, in one `Freelens dependencies` group
PR together with the `@freelensapp/extensions` nightly. A dependency added to
`package.json` follows the Freelens catalog unless the catalog rule excludes
it; one that Freelens does not have must be excluded there, or its lookup fails
on the Dependency Dashboard. The catalog rule matches only `dependencies` and
`devDependencies`, so an override copied from Freelens's `pnpm-workspace.yaml`,
such as `@kubernetes/client-node>@types/node`, is otherwise looked up on npm
and runs ahead of Freelens. Such an override gets a rule of its own, next to
the catalog rule: `matchManagers: ["npm"]`, the override's key in
`matchDepNames`, `overrideDatasource: "custom.freelens-catalog"`, the overridden
package in `overridePackageName`, and the catalog rule's `rangeStrategy`,
`minimumReleaseAge` and `groupName`
(freelensapp/freelens-for-claude-extension@f2f49241828f201890423e070655c2dc04120b23).
This repository has no override. What Freelens does not define (GitHub Actions, the
tool versions in the workflows, `shx`) Renovate updates as usual.
pnpm is the exception: Renovate updates it from the npm registry, in a pull
request of its own, and not to the version of Freelens's `packageManager`.
`packageManager` carries a Corepack hash (`+sha512.…`), and Renovate updates
the hash only from the digest of the new version, which the registry has and a
custom datasource does not; without it the update fails with "no valid digest
available".
`mise.lock` pins a checksum and a URL per tool for all eight platforms; after
changing `mise.toml`, run `mise lock` (not only `mise install`, which re-locks
just the current platform). `mise.lock` is lockfile revision 3
(`lockfile_version = 3`), which needs mise 2026.9.16 or newer; older versions
reject it. `@freelensapp/extensions` is
pinned to one exact version. The libraries the host provides at runtime
(`react`, `react-dom`, `mobx`, `mobx-react`) and their types are
devDependencies only, for compiling and testing; `electron` is a devDependency
for its types only.

pnpm settings live in `pnpm-workspace.yaml`. A dependency runs its install
scripts only when `allowBuilds` sets it to `true`; a new dependency with
install scripts that is not listed there fails `pnpm install`, so add it with
`true` or `false` deliberately. pnpm refuses versions younger than its
`minimumReleaseAge` (1 day), with `@freelensapp/extensions` excluded because
its pinned nightly is often adopted on the day it is published.

`strictPeerDependencies: true` makes `pnpm install` fail when the extension's
own copy of a shared library is outside the peer range that
`@freelensapp/extensions` declares for it: `react`, `react-dom`,
`@types/react`, `@types/react-dom`, `mobx`, `mobx-react`, `monaco-editor` and
`electron`. These peers are optional, so they are checked only when the
extension declares the library, which it does for every one it imports or
compiles against. Without the setting pnpm reports a mismatch as one warning
line and installs anyway. Freelens does not set it, because its own tree takes
these libraries from its catalog, which defines the ranges; an extension
declares its own copies, and these peers are the only place where they are
compared with the versions the host runs. The types are peers as well, so the
package's declaration compiles against the extension's own `@types/react` and
`@types/react-dom`, one copy of each, and the package does not install them for
it. An extension with renderer code declares both: the declaration imports its
React types from `react` and `react-dom`, and the renderer's JSX and component
props are checked against them. A main-only extension needs neither; its code
reaches no React type, and `skipLibCheck` leaves the declaration's own imports
unchecked.

An extension that renders `Renderer.Component.MonacoEditor` compiles against
`monaco-editor` without importing it, so it declares `monaco-editor` in
`devDependencies` at the host's version as well. `MonacoEditorProps` takes its
`options` and callback types from that package; without it they are `any`, and
`skipLibCheck` hides the unresolved import. The extension renders no editor and
does not declare it ("The host-provided libraries, and how to mark them
external" in Freelens's `migrating-from-v1.md`, and contracts C3 and C11 of
`api.md`).

## Common Commands

```bash
# Type checking
pnpm type:check                # All of the programs below, in this order
pnpm type:check:sources        # main and renderer, each with src/common/
pnpm type:check:tests          # Tests and test support
pnpm type:check:tooling        # Vite and Vitest configs, build plugins
pnpm type:check:environments   # Environment tests

# Linting & formatting
pnpm biome:check          # TypeScript/TSX, JS, JSON, CSS, HTML (biome)
pnpm biome:fix            # Auto-fix the formats above
pnpm trunk:check          # Markdown, YAML, TOML, SCSS, workflows, and Biome again (changed files)
pnpm trunk:fix            # Auto-fix Markdown, YAML, SCSS, etc.
pnpm lint:check           # Alias for biome:check
pnpm lint:fix             # Alias for biome:fix
pnpm knip:check           # Unused files, unused and unlisted dependencies (knip)

# Tests
pnpm test:unit            # vitest

# Build
pnpm build                # Both Vite runs, without the type check
pnpm dev                  # Both Vite runs in watch mode, for a directory install

# Pack for testing
pnpm pack:dev             # Bump prerelease version, build, and create .tgz for install in Freelens app

# Local lab (SPEC-0002, e2e/README.md)
e2e/scripts/lab-up.sh static|live   # Create and fill a lab cluster (also refreshes the static events)
e2e/scripts/lab-scale.sh 20 4       # live: scale the workloads, so Karpenter launches or consolidates
e2e/scripts/lab-down.sh static|live # Delete a lab cluster

# Clean
pnpm clean                # Clean dist/
pnpm clean:dts            # Remove generated *.d.scss.ts files
pnpm clean:all            # Clean everything (dist, dts, node_modules, tgz)
```

## Architecture

```text
src/
  main/index.ts                  # Main entry (Main.LensExtension): nothing to do in main
  renderer/index.tsx             # Renderer entry: the page, its menu entry, the Node details item
  renderer/api/<kind>/           # One model per kind and version, its generated types, its tests
  renderer/api/types.ts          # Kubernetes core types the models share
  renderer/data/                 # Where the data comes from: stores, loading, controller version
  renderer/pages/                # The dashboard (states and tabs) and the Overview tab
  renderer/components/           # The other tabs, the NodePool card, charts, error boundary, ErrorPage
  renderer/details/              # The Karpenter section of the host's Node details
  renderer/hooks/                # Data hooks of the NodePool card
  renderer/utils/                # Pure helpers: node status and resources, Karpenter events
  renderer/config/theme.ts       # Colours, icons, labels and status mappings
  renderer/icons/                # SVG icons, imported with ?raw
test/freelens-extensions.ts      # Stub of @freelensapp/extensions for the unit tests
environment-tests/               # Probes for the per-environment programs
build/                           # Vite plugins: host modules, standard decorators, CSS module declarations
integration/__tests__/           # Integration tests, run inside a Freelens checkout, and their shared module
e2e/                             # The local lab: kind clusters, fixtures, scripts (SPEC-0002)
docs/specs/, docs/development/   # Specs, process and roadmap
```

Build output goes to `dist/`: `main.js`, `renderer.js` and `renderer.css`, with
source maps. `main` and `renderer` in `package.json` point at the two entries.

The page, `pages/dashboard.tsx`, is an `observer` with three states: loading,
Karpenter not installed (the cluster does not serve `nodepools.karpenter.sh`),
and the tabs. The tabs read the stores while they render; what they compute
from the objects is in pure modules next to them, which the unit tests cover:
`pages/overview-filter.ts`, `components/PieChart/overview-stats.ts`,
`components/Topology/topology-utils.ts`,
`components/NodeClassesTab/nodeclass-card.ts`,
`components/KarpenterCard/card-utils.ts`, `utils/karpenter-events.ts`,
`utils/kube-helpers.ts` and `details/node-karpenter.ts`. Keep it that way: logic
that needs the host or a store goes into `data/`, logic on objects into a pure
module with a test, and the component only renders.

A click on an object opens the host's details drawer of that object on the
host's list page (`detailUrl` and the `open*Detail` helpers of
`utils/kube-helpers.ts`, `openNodeClassDetail` of `data/nodeclass.ts`); the
extension has no list or details page of its own for a Karpenter kind.

## Data Layer

- **Stores of the Karpenter kinds**: the host's, through the models.
  `getStore()` throws when the cluster does not serve the model's version, so
  `data/stores.ts` reaches them through `getServedStore(...)`, which tries the
  versions of a kind newest first and returns `undefined` when none is served
  (`getNodePoolStore()`, `getNodeClaimStore()`, `getNodeOverlayStore()`,
  `getEC2NodeClassStore()`, `getAKSNodeClassStore()`). Only one version of a
  kind is used, so no object is counted twice. AKSNodeClass has two models,
  `v1beta1` and `v1alpha2`: the Azure provider 1.14 serves only `v1beta1`.
- **Nodes and pods**: the host's `nodesStore` and `podsStore`.
- **Events**: a store of the extension, `KarpenterEventStore`, over the
  host's `Renderer.K8sApi.eventApi`, for the namespaces in
  `karpenterEventNamespaces` (`default`, where Karpenter writes the events of
  its cluster-scoped objects, `karpenter` and `karpenter-system`). It leaves
  what the host's own Events page has loaded alone.
- **Loading**: `data/load.ts` loads each served store and subscribes to it,
  then the controller version (`data/controller-version.ts`: the Deployment
  labelled `app.kubernetes.io/name=karpenter` in any namespace, then one
  named `karpenter*` in `karpenter` or `karpenter-system`, then the version in
  the NodePool CRD, else "installed"). `loadAndSubscribe` loads a store again
  when the load failed, with a growing wait, because the API server can answer
  429 to the first list of a kind whose CRD was just created, and the host's
  `loadAll` then resolves with the store empty.
- **The page's state**: `data/use-dashboard-data.ts` keys the load on the API
  bases of the served stores, so the page loads again, and stops the old
  subscriptions, when a Karpenter CRD appears or goes away while it is open.
  A new store goes into that key, into `loadKarpenterData`, and into
  `getServedStore` in `data/stores.ts`.
- **Memos over a store's items**: `useItems(store.items)` of
  `data/use-items.ts`, never `store.items` itself (see "Rules That Fail
  Silently").

The extension sets no `customResources`: it has no page for any Karpenter
kind, so the kinds stay in the Custom Resources tree of the cluster sidebar,
where the host lists and shows them.

## CRD KubeObject Pattern

A model is a subclass of `Renderer.K8sApi.LensExtensionKubeObject`, one file
per kind and API version, `src/renderer/api/<kind>/<kind>-<version>.ts`:
`nodepool-v1.ts`, `nodeclaim-v1.ts`, `nodeoverlay-v1alpha1.ts`,
`ec2nodeclass-v1.ts`, `aksnodeclass-v1beta1.ts` and `aksnodeclass-v1alpha2.ts`.
Their spec and status types are in `*-types.ts` next to them; NodePool and
NodeClaim share `api/karpenter/karpenter-v1-types.ts`.

The host reads the model's metadata from the class, through `static readonly`
properties. The objects in its stores are instances of the host's
`KubeObject`, not of the extension's subclass. The methods of `KubeObject`
itself are there (`getName()`, `getNs()`, `getId()`,
`getResourceVersion()`); a method the subclass defines is not, and calling
it throws. So:

- **Metadata**: `static readonly` `kind`, `namespaced`, `apiBase` and `crd`.
  Every Karpenter kind is cluster-scoped: `Renderer.K8sApi.ClusterScopedMetadata`.
- **Instance type**: `declare kind` and `declare apiVersion`, with the class's
  kind and version as literals, so that the two AKSNodeClass models, which
  differ only in optional fields, are not assignable to each other, and
  `detailsFor` would reject a component written for the other one. `declare`
  emits nothing.
- **Per-object logic**: a `static` method that takes the object, such as
  `NodePool.getTemplateSpec(nodePool)`, `NodeClaim.isClaiming(nodeClaim)` or
  `NodeOverlay.forNodePool(overlays, nodePool)`.
- **Fields**: read `object.spec` and `object.status` through the model's typed
  spec and status.
- **Forbidden**: instance methods on the subclass; a fallback such as
  `typeof (object as any).getX === "function" ? ...`, which always takes the
  fallback; `as any`.

```typescript
export class NodePool extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.ClusterScopedMetadata,
  NodePoolStatus,
  NodePoolSpec
> {
  declare kind: "NodePool";
  declare apiVersion: "karpenter.sh/v1";

  static readonly kind = "NodePool";
  static readonly namespaced = false;
  static readonly apiBase = "/apis/karpenter.sh/v1/nodepools";

  static readonly crd = {
    apiVersions: ["karpenter.sh/v1"],
    plural: "nodepools",
    singular: "nodepool",
  };

  static getTemplateSpec(nodePool: NodePool): NodeClaimTemplateSpec | undefined {
    return nodePool.spec?.template?.spec;
  }
}

export class NodePoolApi extends Renderer.K8sApi.KubeApi<NodePool> {}
export class NodePoolStore extends Renderer.K8sApi.KubeObjectStore<NodePool, NodePoolApi> {}
```

The file also exports a `KubeApi` and a `KubeObjectStore` subclass, for their
types; neither is instantiated, because the store comes from the host,
through `getStore()` (see "Data Layer").

Any component that reaches a store through `getStore()`, directly or through
`data/stores.ts`, is an `observer`. `getStore()` reads the host's API
registry, which is observable, and the host registers a CRD's APIs only after
the cluster frame has loaded the CRDs. Freelens restores the last page when a
cluster is opened, so the page often renders before that; as an `observer` it
renders again when the kind is served. `data/use-dashboard-data.test.tsx`
checks it with a `getStore` that reads an observable.

### Adding an API

A new kind, or a new version of a kind, takes:

1. **The types.** They follow the API of the controller that serves the
   resource, read from its sources at the release that serves the version,
   and not from memory. Karpenter and both providers are written with
   kubebuilder, so the types follow their Go types (`pkg/apis/<version>/` of
   each repository), with the optional fields of the generated CRD
   (`pkg/apis/crds/`):
   - Every Go struct has a TypeScript interface of the same name, with the
     same fields under their `json` names.
   - A field is optional when the CRD does not require it. `controller-gen`
     decides that from the markers, not from the `json` tag: `+required`
     makes the field required and `+optional` makes it optional, whatever the
     tag says; a field without a marker is optional with `omitempty` and
     required without it, unless the package sets
     `+kubebuilder:validation:Optional`. The generated CRD settles any doubt.
   - Every `+kubebuilder:validation:Enum` is a string-literal union type
     alias.
   - A Kubernetes core type the models share (`Condition`, `Taint`,
     `NodeSelectorRequirement`, `ResourceList`, ...) goes to
     `src/renderer/api/types.ts`. A type of the same name that differs in one
     API, such as the `NodeSelectorRequirement` of `karpenter.sh/v1alpha1`
     with the operators `Gte` and `Lte`, stays in that API's types file.
   - The header of the types file names the repository and the release the
     types follow. A new version of a kind starts as a copy of the newest
     version's files; the diff of the Go types between the two releases says
     what changes.
2. **The model**, as above, with its tests next to it: the metadata, the
   `declare` literals and every `static` helper.
3. **The store**: a getter in `data/stores.ts` through `getServedStore`,
   newest version first; the store in `loadKarpenterData` of `data/load.ts`
   and in the key of `data/use-dashboard-data.ts`; the getter in the
   `vi.mock("./stores")` of `use-dashboard-data.test.tsx`.
4. **What the tabs show**, in a pure module with tests (see "Architecture").
5. **The lab**: the CRD in `install_karpenter_crds` or
   `install_provider_crds` of `e2e/scripts/lab-up.sh` if it is new, and an
   object in `e2e/fixtures/static/`, numbered where it belongs; the list of
   fixtures in SPEC-0002.
6. **The integration test**: one text in `integration/__tests__/karpenter.tests.ts`
   that only the new object makes the view show.

Then check the result in Freelens ("Checking the Extension in Freelens") on
both labs.

## Renderer Components

- Components that read a store or an observable are `observer` components from `mobx-react`, which the build maps to
  the host's copy. They are function components; the only class component is the error boundary.
- The page and the Node details item render inside an `ErrorBoundary` from `src/renderer/components/error-boundary.tsx`,
  a class component of the host's React with `getDerivedStateFromError` and `componentDidCatch`. It logs what its
  children throw while React renders them, with `extension.name` and the component stack, and renders `ErrorPage` in
  their place. The details item renders again when the host passes a new `object`, which is the boundary's reset key.
  - The boundary is applied where the registrations are made: `clusterPages` and `kubeObjectDetailItems` are mapped
    through `withPageErrorBoundary` and `withDetailsErrorBoundary`, each taking `this` and a registration, so an entry
    added to a field is wrapped as well. A `kubeObjectMenuItems` field would be mapped through
    `withMenuItemErrorBoundary`. Each field is annotated with its type from `Renderer.LensExtension`
    (`clusterPages: Renderer.LensExtension["clusterPages"] = [...]`), because the mapping refers to `this`, and its
    type would otherwise depend on itself.
  - A `try`/`catch` around the call of a component is not enough: it sees only what the call throws, not what a child
    throws when React renders it. Such an error goes up to the nearest boundary of the host: the one around the main
    area of a cluster for a page, and the one around the whole cluster frame for a details item, because the host has
    none around the details drawer of an extension.
- The Node details item is registered with `Renderer.K8sApi.detailsFor(Renderer.K8sApi.Node, { Details })`, which takes
  `kind` and `apiVersions` from the class and types the props of `Details` from it. Its props are
  `Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Node>`. The host renders it for every node, after its own
  sections, so it renders nothing for a node Karpenter does not manage.
- The host renders a cluster page with `params` only. The page gets the extension from the registration
  (`Page: () => <KarpenterDashboard extension={this} />`).
- Components import their CSS module for the class names only, with no `?inline` import and no `<style>` tag; the
  rules, keyframes included, reach the page through `renderer.css` (see "CSS"). A keyframe defined in a CSS module is
  renamed with it, so the `animation` that uses it is in the same module, not in an inline style.
- SCSS modules get TypeScript declarations (`*.module.d.scss.ts`), written during the renderer build (see
  "CSS module declarations"). They are committed, because `pnpm type:check` runs without a build; commit the
  regenerated file with a change to its SCSS module. `pnpm clean:dts` removes them.
- Icons are SVG files imported with `?raw` and rendered by `Renderer.Component.Icon` through its `svg` prop.

### Colours and themes

The extension follows the host's theme, light or dark:

- Neutral colours (backgrounds, borders, text) are the host's CSS variables: `--contentColor`, `--borderColor`,
  `--borderFaintColor`, `--textColorAccent`, `--textColorPrimary`, `--textColorSecondary`, `--textColorTertiary`,
  `--primary`, `--colorInfo`. A shade between two of them is a `color-mix()`, such as
  `color-mix(in srgb, var(--textColorAccent) 8%, var(--contentColor))`, which is lighter than the background in the dark
  theme and darker in the light one. A fixed dark or light grey shows in one theme only.
- `COLOR` in `config/theme.ts` holds the neutral colours as `var(...)` strings, and the colours of statuses, capacity
  types and event groups as fixed values that read on both backgrounds.
- A CSS variable works in CSS and in the `style` of an element, not in an SVG presentation attribute
  (`fill="var(--x)"` is ignored) and not in a canvas. In SVG, set the colour through `style` (`style={{ fill }}`). The
  canvas of `Renderer.Component.PieChart` takes fixed colours; `COLOR.neutral` is the grey for data that shows on both.
- Check a change to colours with every tab in both themes (see "Checking the Extension in Freelens").

## Rules That Fail Silently

Each of these compiles when it is broken, and breaks the extension at runtime
or not visibly at all. The sections named in parentheses explain the
mechanism; this is the list to check a change against.

- **The host's React and mobx, one copy each.** Import `react`, `react-dom`,
  `mobx` and `mobx-react` by their bare module ids. A second React throws
  `invalid hook call`; a second mobx throws nothing, and the host never reacts
  to its observables. The build fails on the ways a second copy gets in
  ("Modules provided by the host").
- **Standard decorators.** An observable field is `@observable accessor`, and
  the class does not call `makeObservable(this)`. Without `accessor` the
  production build of mobx leaves the field unobservable; a unit test that
  imports the class fails ("Decorators").
- **No Node or Electron in renderer and common code.** They are `undefined` in
  the renderer. The build fails on an import, `pnpm type:check` on a global
  ("Process-specific settings").
- **One CSS asset, `dist/renderer.css`.** Any other name, or a second asset,
  leaves the extension unstyled. Nothing checks it; look at `dist/` after a
  change to the CSS setup ("CSS").
- **One tsconfig per environment.** Each program has only its runtime's `lib`
  and `types`, and no declaration may load Node into the renderer or the DOM
  into main; otherwise a wrong API type-checks and is `undefined` at runtime.
  The environment tests fail on a leak ("TypeScript").
- **No instance method on a KubeObject subclass.** The objects from the host
  do not have it, and the call throws. Nothing checks it
  ("CRD KubeObject Pattern").
- **A component that reaches a store through `getStore()` is an
  `observer`.** The host registers a CRD's APIs after the cluster frame has
  loaded the CRDs; a component that is not an `observer` and rendered before
  then shows Karpenter as not installed until the user navigates away and
  back. Only a test whose `getStore` reads an observable shows it
  ("CRD KubeObject Pattern").
- **`this.props` of an `@observer` class component only in its `render()`.**
  Under mobx-react 10 they are not observable. A `@computed` getter that reads
  them, or a method the host calls from its own derivations (`getItems` and
  `customizeHeader` of `KubeObjectListLayout`), throws
  `[mobx-react] Cannot read "X.props" in a reactive context` when the page
  renders, and the host shows its "App crash" page. The type check, the build
  and unit tests in a Node environment pass. Read the values in `render()` and
  hand them to the callback, or make the component a function component
  ("MobX 7 and mobx-react 10 (standard decorators only)" in Freelens's
  `migrating-from-v1.md`).
- **Every page, details item and menu item inside an error boundary.** A
  `try`/`catch` around the call of a component catches only what the call
  throws, not what a child throws when React renders it. Such an error replaces
  the main area with the host's error, or, from a details item, the whole
  cluster view with the host's crash page. Map `clusterPages`,
  `kubeObjectDetailItems` (and `kubeObjectMenuItems`) through their wrappers in
  `error-boundary.tsx` ("Renderer Components").
- **A cluster page gets the extension from its registration.** The host passes
  `params` only. The type check rejects a page that requires another prop, but
  not one that declares it optional ("Renderer Components").
- **An ESM `main`, and the entries in `package.json` unchanged while
  `pnpm dev` runs.** The host refuses to reload a CommonJS main and logs why,
  and it watches only the entries it started with, so a manifest change needs
  Freelens restarted.

- **A memo over a store's items is keyed on `useItems(items)`.** The host keeps one
  observable array per store and updates it in place, with `replace` and
  `splice`, so `store.items` is the same array whatever happens to the
  objects in it. A `useMemo` keyed on it, or on a prop that is `store.items`,
  is never computed again, and an open tab keeps the objects it had when it
  was opened. `useItems` of `data/use-items.ts` returns a copy that is a new
  array when an object is added, removed or updated (by id and
  `resourceVersion`); an `observer` that reads the items while it renders, with
  no memo, follows them anyway ("Data Layer").
- **`loadAll` resolves when the load failed.** It reports the failure through
  `onLoadFailure` and leaves the store empty. Pass `onLoadFailure` and decide
  what a failure means, as `loadAndSubscribe` does.
- **CSS variables do not reach SVG attributes or a canvas.** `fill` and
  `stroke` take them only through `style` ("Colours and themes").

Neither `pnpm build` nor `pnpm dev` runs the type check, so a Node global in
renderer code passes them; `pnpm type:check` and `type-check.yaml` catch it.

## Build

`vite.config.mjs` builds one entry point per run, in library mode, as ESM:
`vite build` builds the renderer and empties `dist/`, and `vite build --mode
main` builds main next to it. The two runs share no chunk; each bundle carries
its own copy of the `src/common/` code it imports. Nothing is minified.

`pnpm dev` runs the same two builds in watch mode, side by side, for a
directory install: the host reloads the extension when either entry is
rewritten. Its renderer run passes `--no-emptyOutDir`. In watch mode Vite
empties the output directory again before every rebuild, so a renderer rebuild
would delete `dist/main.js`, and the host would have no main entry to reload.

### Modules provided by the host

The host publishes its singletons on `globalThis.FreelensExtensionApi`, and
each process publishes only the ones it has. This is contract C3 of the
Freelens extension API (`docs/extensions/api.md`):

| Module id           | Global            | Published in |
| ------------------- | ----------------- | ------------ |
| `react`             | `React`           | renderer     |
| `react-dom`         | `ReactDom`        | renderer     |
| `react/jsx-runtime` | `ReactJsxRuntime` | renderer     |
| `mobx`              | `Mobx`            | both         |
| `mobx-react`        | `MobxReact`       | renderer     |
| `monaco-editor`     | `MonacoEditor`    | renderer     |

`build/vite-plugin-host-modules.mjs` replaces a bare import of one of these
with a module that reads the global, in the extension's code and in every
library it bundles. Its named exports are the members of the copy installed as
a devDependency, which is pinned to the host's version, so an import of a name
the host's version lacks fails the build. The plugin also fails the build on an
import of a host module that the process does not publish (`react` in main),
and on a subpath of a host package that the host does not publish
(`react-dom/client`, `react/jsx-dev-runtime`). Both would otherwise either read
`undefined` at runtime or bundle a second copy. A second React throws
`invalid hook call`; a second mobx throws nothing, and the host simply never
reacts to its observables.

Everything else is bundled. That includes `@freelensapp/extensions`, a shim of
three lines that reads `Common`, `Main` and `Renderer` off the same global; it
must not be mapped. The host installs no dependencies of an extension, so
whatever the code needs at runtime and the host does not provide has to be in
the bundle.

### Process-specific settings

- **Renderer**: nothing is external. Renderer code gets no Node or Electron, and
  an import of a Node builtin or of `electron` fails the build (Vite would
  otherwise replace it with an empty module and only warn).
  `process.env.NODE_ENV` is replaced at build time, because library mode
  leaves it for a consumer's bundler and the page has no `process`.
- **Main**: Node builtins (`node:*` and bare) and `electron` stay external.
  Bundled packages resolve with Vite's server conditions, so main gets their
  Node builds rather than their browser builds. Main is built for Rolldown's
  `node` platform (`build.rolldownOptions.platform`), the renderer for
  `browser`, the default of a Vite client build. A bundled CommonJS package
  `require()`s the builtins, and an ES module has no `require`: for the
  `browser` platform Rolldown turns the call into a `__require` shim that
  throws ``Calling `require` for "node:assert" in an environment that doesn't
  expose the `require` function`` as soon as the bundle is evaluated, and for
  `node` it defines `__require` with `createRequire(import.meta.url)`.
  `pnpm build` and `pnpm type:check` pass either way, and nothing before
  Freelens evaluates `dist/main.js`, so on the wrong platform the extension
  fails only when Freelens loads it. A main bundle without CommonJS is the
  same on both platforms, byte for byte.

### Decorators

MobX 7 supports standard decorators only, and Oxc, which transpiles TypeScript
for Vite, passes them through unlowered, while neither Node nor Chromium runs
them yet. `build/vite-plugin-standard-decorators.mjs`, copied from Freelens,
hands every module with a decorator to esbuild first, which lowers the
decorators and their `accessor` fields. Both `vite.config.mjs` and
`vitest.config.ts` use it. A decorator that reaches the host or a test
unlowered is a syntax error when the module is evaluated.

An observable field is an `accessor` (`@observable accessor enabled = false;`),
and the class does not call `makeObservable(this)`. `@observable` on a plain
field type-checks and builds; the development build of mobx throws when the
class is defined, and the production build leaves the field unobservable.

### CSS

The host links the stylesheet named after the renderer entry, `renderer.css`
next to `renderer.js`. Library mode extracts the CSS of the whole bundle into
that one file (`build.lib.cssFileName`). A build that emits more than one CSS
asset, or a differently named one, leaves the extension unstyled. A component
imports its CSS module for the class names only and renders no `<style>` tag;
the rules reach the page through `renderer.css`. CSS modules
use `camelCaseOnly` class names.

### CSS module declarations

`build/vite-plugin-css-module-declarations.mjs` writes `x.module.d.scss.ts`
next to every `x.module.scss` the renderer build imports, in `vite build` and
in watch mode. It takes the class names from Vite's own `preprocessCSS`, with
the build's resolved config, so they are the names the bundle exports, after
`localsConvention`; a class inside `:global(...)` is not one of them.

The plugin is written so that a build cannot leave a committed declaration
empty or partial, whether it fails, is interrupted or is killed:

- it awaits its work in `transform`, so the build does not end while a write is
  pending;
- it writes a declaration only when the content changed, so a build that
  changes no stylesheet touches no file;
- it writes to a temporary `*.tmp` file next to the declaration and renames it
  over the declaration, which replaces it whole or not at all.

The plugin has no options and no dependency other than Vite, and it refers to
no path of this repository, so other extensions copy it unchanged.

## TypeScript

Main code runs in Node, renderer code in a browser page, and common code in
both. Each is type-checked in a program of its own, so that an API the runtime
does not have fails `pnpm type:check` rather than the extension:

| Config                       | lib                       | types                 | Files                                                                |
| ---------------------------- | ------------------------- | --------------------- | -------------------------------------------------------------------- |
| `src/main/tsconfig.json`     | ES2024                    | `node`                | `src/main/`, `src/common/`                                           |
| `src/renderer/tsconfig.json` | ES2024, DOM, DOM.Iterable | `vite/client`         | `src/renderer/`, `src/common/`                                       |
| `src/common/tsconfig.json`   | ES2024, WebWorker         | none                  | `src/common/`                                                        |
| `src/tsconfig.json`          | ES2024, DOM, DOM.Iterable | `node`, `vite/client` | `*.test.ts(x)` under `src/`, and `test/`                             |
| `tsconfig.json`              | ES2024                    | `node`                | `vite.config.mjs`, `vitest.config.ts`, `svgo.config.mjs`, `build/`   |

All of them extend `tsconfig.base.json`, which has the compiler options of
Freelens's fixture extension: `strict`, `moduleResolution: Bundler`,
`useDefineForClassFields`, `noUncheckedSideEffectImports` and `skipLibCheck`
among them. `skipLibCheck` is required: `extension-api.d.ts` is one declaration
for both processes and names DOM types and the `Electron` namespace, which no
single program has. Write `types` in every config; it decides which `@types`
packages a program sees.

### Main, renderer and common

The main and renderer configs both include `src/common/`. Compiled as main,
common code fails on the DOM; compiled as renderer, it fails on Node. What
passes both is valid in both, and that is the check that decides. Common code
uses only what both runtimes have: `globalThis.crypto`, `TextEncoder` and
`TextDecoder`, `URL` and `URLSearchParams`, `AbortController`,
`structuredClone`, and the timers, with the timer handle kept opaque.

`src/common/tsconfig.json` is for the editor, which gives a file to one config
only. Its `WebWorker` lib is the closest single match and an approximation:
`self` and `postMessage` compile there and fail in the main program.

The common program is not compiled on its own. `environment-tests/tsconfig.json`
extends `src/common/tsconfig.json` and keeps its `include`, so
`tsc -p environment-tests`, in `pnpm type:check:environments`, compiles
`src/common/` with the common settings, together with the probes. A program of
`src/common/` alone has no input when the directory has no source file, and
`tsc` stops on that (TS18003); the environment tests always have their probes,
so `pnpm type:check` passes with an empty `src/common/`. Keep
`src/common/tsconfig.json` even then: the editor uses it, and the environment
tests extend it.

The split does not cover the API namespaces: `Main` and `Renderer` compile in
every program, and the one the process does not have is `undefined` at runtime.
Common code uses `Common`.

### Asset imports

The renderer program has `vite/client`, which declares `*?raw`, `*?inline` and
the CSS modules and brings no Node into the program. With
`allowArbitraryExtensions`, `import styles from "./x.module.scss"` resolves to
the generated `x.module.d.scss.ts`, so a class name that the stylesheet lacks
fails the check. Without that file, after `pnpm clean:dts`, the import falls
back to the untyped declaration of `vite/client`.

### Environment tests

`types` and `lib` alone do not keep an environment pure. A declaration file
with `/// <reference types="node" />` loads all of `@types/node` into any
program that reaches it, whatever `types` says, and one with
`/// <reference lib="dom" />` loads the DOM. `environment-tests/` proves the
split holds:

| File             | Compiled with          | Must                      |
| ---------------- | ---------------------- | ------------------------- |
| `node-apis.ts`   | renderer, common       | fail on every marked line |
| `dom-apis.ts`    | main, common           | fail on every marked line |
| `worker-apis.ts` | main                   | fail on every marked line |
| `shared-apis.ts` | main, renderer, common | pass                      |

Each line that must fail carries `// @ts-expect-error`, so a program that
starts accepting it fails with an unused directive. The configs there extend
the source configs and keep their `include`, so the probes are compiled
together with the sources and every declaration the sources reach. Compiled
alone, they would not see a declaration that a dependency of the sources brings
in.

When a declaration leaks, the environment tests fail; keep the leak out rather
than relax a probe. For Node
in the renderer, point `typeRoots` of the renderer config at a directory with
an empty `node` package, which a reference directive resolves to first. For
the DOM in main, remove the directive from the declaration with `pnpm patch`.

### Tests and tooling

Tests are not in the environment programs. Vitest runs them in Node, with
jsdom for files that ask for it, so `src/tsconfig.json` gives them the DOM and
Node. It sits in `src/` so that an editor finds it for a test file: the
environment config next to the test excludes it, and the editor goes on to the
next `tsconfig.json` up the tree. Tests compile against the real
`@freelensapp/extensions` declaration, while Vitest replaces the package with
`test/freelens-extensions.ts` at runtime.

No config declares the Vitest globals. TypeScript has no per-file globals, so
declaring `describe` or `vi` for tests would declare them for every file in the
program. Test and test-support files import what they use:

```ts
import { describe, expect, it, vi } from "vitest";
```

The module resolves from every program, so Biome keeps it out of the
extension's code: `style/noRestrictedImports` rejects an import of `vitest`
outside `src/**/*.test.*`, `test/` and `integration/`. The same rule rejects
there the testing helpers of React: the `act` named import of `react`,
`react-dom/test-utils` and `@testing-library/*`. They type-check, build and
pass the unit tests, which run the development build of React, but `act`
delegates to `React.act`, which the production build that Freelens runs leaves
out, so the call throws only in the host. `globals: true` stays on in
`vitest.config.ts` at runtime only, because React Testing Library registers its
automatic cleanup only when `afterEach` is a global.

`@freelensapp/extensions` is stubbed because the real package cannot run in a
test: it is a shim that reads `Common`, `Main` and `Renderer` off
`globalThis.FreelensExtensionApi`, which only the host sets, and it ships no
mocks. The `alias` in `vitest.config.ts` points the import at
`test/freelens-extensions.ts`, for the tests and for the extension code they
import. The stub covers only what the tests use, at runtime only; the type
check still uses the real declaration. So a test that reaches a member the stub
lacks compiles and fails on `undefined`: add the member to the stub, as small as
the test needs. Here it has, besides the template's `LensExtensionKubeObject`,
`KubeApi`, `KubeObjectStore` and `Common.logger`, the drawer components
`DrawerItem` and `DrawerTitle` and the `Icon` component as plain elements, and
`Navigation.navigate` as a spy. The other host modules are not stubbed: `react`, `mobx` and
`mobx-react` resolve to the devDependencies, the host's versions.

Vitest runs the development build of mobx, so a test that imports
a class with `@observable` on a field without `accessor` fails when the class
is defined. This extension has no class with `@observable`; one that is added gets a test that imports it.

The root `tsconfig.json` checks the tooling files. It has `checkJs`, so the
Vite config and the build plugins are type-checked too; give their function
parameters JSDoc types.

## Lint and CI

### Biome

`biome.jsonc` has the formatter, import groups and rules of Freelens. Two
overrides are specific to how the extension is laid out:

- `style/noRestrictedImports` keeps `vitest` and the testing helpers of React
  out of the extension's code (see "Tests and tooling").
- `correctness/noNodejsModules` rejects a Node builtin import in
  `src/renderer/` and `src/common/`, tests left out. It flags the import in the
  editor, before `pnpm type:check` does; it does not see Node globals such as
  `Buffer` or `process`, which only the type check catches.

Every path in an override starts with `**/`. Trunk runs Biome from a sandbox
outside the repository, with `--config-path` pointing back at `biome.jsonc`,
and there a path anchored at the repository root matches no file, so the
override silently does nothing. A plain `biome check` matches both forms, so
only `trunk check` shows the difference.

In that sandbox, Biome also cannot apply `vcs.useIgnoreFile`: since 2.5.15 it
matches every target against the repository's `.gitignore` and panics on a
path outside the repository root, so every file fails. The Biome commands in
`.trunk/trunk.yaml` pass `--vcs-use-ignore-file=false`, because Trunk applies
`.gitignore` itself before it picks the targets; `biome.jsonc` keeps the
setting on for `pnpm biome` and editors.

Renovate updates Biome, in the `biome` script and in `.trunk/trunk.yaml`, but
cannot run `biome migrate`. `biome-migrate.yaml` runs it on the Renovate
branch and commits the migrated `biome.jsonc` there, so that the update and its
migration are one pull request. The commit is by `github-actions[bot]`, which
`gitIgnoredAuthors` in `.renovaterc.json` lists, so that Renovate does not take
it for a manual edit and stop updating the branch.

Biome does not read SCSS; Trunk formats it with Prettier.

### Knip

`pnpm knip:check` runs knip twice, for unused files and for dependencies: a
development pass over everything, and a `--production --strict` pass over the
code that reaches the bundles, which are the entries marked with `!` in
`knip.jsonc`. In the production pass only `dependencies` count, so a bundled
library that the extension's code imports belongs there. The host-provided
modules are devDependencies, for their types, and are ignored.

A file is unused when no entry reaches it: a leftover module, a barrel that
nothing imports. The production pass starts from the `!` entries only, so it
also reports a module that only tests import. The fix is to remove the file,
not to ignore it. The check does not include unused exports and types: on this
tree they are mostly the exported spec and status types of the models.

`knip.jsonc` lists the entries knip cannot find: the two source entries, the
Vitest alias target `test/freelens-extensions.ts` and the probes in
`environment-tests/`. Its Vite plugin is off: it adds the renderer entry of
`vite.config.mjs` as a development entry, which displaces
`src/renderer/index.tsx!`, and the production pass then skips the renderer.
`--no-config-hints` is set because one config serves both passes, and an entry
that only the production pass needs is reported as redundant by the other.

Two more settings keep the file check to real findings. `project` leaves out
the CSS module declarations with `!src/**/*.d.scss.ts`: TypeScript reaches them
through `allowArbitraryExtensions`, while knip resolves
`import styles from "./x.module.scss"` to the stylesheet, so nothing would
import them. The negation has no trailing `!`, which would apply it to the
production pass only. And the SVGO plugin is on (`"svgo": true`), so that
`svgo.config.mjs` is an entry: Trunk runs SVGO, and no dependency turns the
plugin on.

`ignore` leaves out `dist/**`. The `main` field of `package.json` makes
`dist/main.js` an entry once it exists, and the `knip` script runs with
`--no-gitignore`, so after `pnpm build`, which `check.yaml` runs first, knip
would analyse the bundle and report what it inlines from the libraries it
bundles: a `spawnSync("wsl.exe")` in a bundled `@kubernetes/client-node` comes
out as `Unlisted binaries: wsl.exe dist/main.js`. Run `pnpm knip:check` after a
build when changing `knip.jsonc`, as `check.yaml` does; without `dist/` the
problem does not show.

### Workflows

The workflows of the template:

| Workflow                 | Runs                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| `type-check.yaml`        | `pnpm type:check`                                                             |
| `check.yaml`             | `pnpm build`, `pnpm lint:check`, `pnpm knip:check`                            |
| `unit-tests.yaml`        | `pnpm test:unit`                                                              |
| `trunk-check.yaml`       | `trunk check --all`                                                           |
| `integration-tests.yaml` | the integration tests in `integration/`, against a Freelens build             |
| `mise-lock-check.yaml`   | on a change to `mise.lock`: no checksum changed for an unchanged tool version |

The release workflows (`npm-version.yaml`, `tag.yaml`, `release.yaml`) are
described in `RELEASE.md`, the Claude Code workflows (`claude.yaml`,
`claude-task.yaml`, the template's) in "GitHub Actions (Claude Code Action)
Rules".

The type check has a workflow of its own, on pull requests and on pushes to
`main`, as in Freelens. It runs every program, tests, tooling and environment
tests included, which no build reaches, and a type error shows as its own
failed check rather than as a failed build. `check.yaml` builds without the
type check for the same reason, so it does not run twice.

### Integration tests

The integration tests run inside a Freelens checkout: the workflow builds the
extension, packs it with a `.tgz.sha256` checksum next to the tarball, as the
release publishes it, checks out and packages Freelens, starts the static lab
of SPEC-0002 with `e2e/scripts/lab-up.sh static`, copies
`integration/__tests__/` into `freelens/integration/__tests__/` and runs them
there under Freelens's Vitest, with its helpers. Each test file is a session
with an app of its own, which installs the tarball from the extensions page,
and fails on any error logged by either process:

- `extensions.tests.ts` installs the extension. It needs no cluster.
- `karpenter.tests.ts` opens the static lab and, in one `it` each, every tab
  of the dashboard, the details of a Karpenter node, and the details its links
  open (from the dashboard and from the node's details), which must stay open
  (B14). Each checks texts that
  only the fixtures of `e2e/fixtures/static/` produce (the NodePool `empty`,
  a NodeOverlay, a disrupted node, the `Finalized` event, ...), several of them
  for a bug of 1.0.1 or an improvement of SPEC-0003, named in a comment, and
  that the error boundary rendered no error page. The session leaves out of
  its error check only the host's requests to the metrics API, which the static
  lab does not serve and the host's Nodes page asks for.

The sessions only read the cluster: they create and delete nothing, and
`clusterReady()` in `extension-helpers.ts` checks, read-only, that the kind
cluster is up, has the fixtures and still has their events (the API server
drops events an hour after they are written; `lab-up.sh static` writes them
again). Outside CI a session skips with a warning when it is not; in CI (`CI`
set) the run fails instead, so that a mistake in the workflow does not turn
into a silent skip. `TEST_KIND_CLUSTER_NAME` names the kind cluster
(`karpenter-lab-static` by default), and every kubectl call names its context,
`kind-<name>`, so a run never acts on the current context. `EXTENSION_PATH`
is the tarball to install.

The tests are deterministic, so the workflow does not retry them: it passes
`--retry=0`, which overrides the `retry: 2` of Freelens's Vitest config, and
runs the step once, under `timeout 600`.

The code the sessions share is in `integration/__tests__/extension-helpers.ts`:
starting the app with the error collector, installing the extension, opening
the kind cluster, the dashboard, a tab and a node's details. Its name does not
match `*.tests.ts`, so Freelens's Vitest does not collect it. The directory
stays flat, because the workflow copies it with `cp integration/__tests__/*`.
Freelens's helper `kindReady` deletes a namespace, so the sessions do not use
it.

To run them locally: start the static lab, build and package Freelens
(`pnpm build && pnpm build:app:dir` in the Freelens checkout), pack the
extension, copy `integration/__tests__/*` into the Freelens checkout as the
workflow does, and run `pnpm test:integration --retry=0` there with
`EXTENSION_PATH` and a `HOME` whose `.kube/config` is the
lab's kubeconfig only. Freelens reads the default kubeconfig folder from the
user's home directory in the system's user database, not from `HOME`, so on a
machine with other clusters run the app in a sandbox where that directory
holds only the lab's kubeconfig.

## Checking the Extension in Freelens

The functional checks of a change run against Freelens, started with
`pnpm dev` from a freelensapp/freelens checkout or from a packaged build, and
the local lab. `pnpm dev` of Freelens starts Electron with
`--remoteDebuggingPort 9223`, so an agent can drive the app over the Chrome
DevTools Protocol. How to attach Playwright MCP to it is in Freelens's
`DEVELOPMENT.md`, "Inspecting the running dev app from an AI agent"; start
Freelens before the session connects. Playwright MCP writes its snapshots to
`.playwright-mcp/`, which is git-ignored.

Without the MCP server, a `playwright-core` script with
`chromium.connectOverCDP("http://127.0.0.1:9223")` does the same. End such a
script by exiting the process; do not close the browser, which belongs to
Freelens.

### The local lab

`e2e/` has two kind clusters with Karpenter objects, so that no check needs a
cloud account (SPEC-0002, `e2e/README.md`):

- `static` (`karpenter-lab-static`): the Karpenter, EC2NodeClass and
  AKSNodeClass CRDs and the numbered fixtures of `e2e/fixtures/static/`, with
  written status and events, and no controller. Deterministic: the integration
  tests and the screenshots use it. `e2e/scripts/lab-aks-v1alpha2.sh on` also
  serves AKSNodeClass `v1alpha2`.
- `live` (`karpenter-lab-live`): Karpenter 1.15.0 with its KWOK cloud provider,
  in `kube-system` as its chart installs it, and workloads that
  `e2e/scripts/lab-scale.sh` scales, so that Karpenter launches and
  consolidates nodes and writes real events.

Safety, which every change to `e2e/` keeps:

- Each profile has its own kubeconfig, `.e2e/<profile>/kubeconfig`, written by
  `kind create cluster --kubeconfig`; the scripts set `KUBECONFIG` to that file
  only and name the context on every `kubectl` and `helm` call. They never read
  or write the user's kubeconfig and never act on its current context; the
  guard in `e2e/scripts/lib.sh` stops a script whose context is not a lab's.
- Point Freelens at the lab's kubeconfig only. Freelens reads the default
  kubeconfig folder from the user's home directory in the system's user
  database, not from `HOME`, so on a machine with production contexts start the
  app with a user data directory (`FREELENS_INTEGRATION_TESTING_DIR`) whose
  preferences sync only the lab's kubeconfig, or in a sandbox.
- Karpenter's own `make` targets for kind act on the current context; the lab
  does not use them.
- The static fixtures of nodes, NodeClaims, NodePool status and pods are
  generated by `e2e/fixtures/static/gen-fixtures.py`; change the generator and
  run it, rather than editing those files.

### Installing the checkout

1. `pnpm install`, then `pnpm build`. After a branch switch, `node_modules`
   can still hold another stack, and Freelens loads the extension from
   `dist/`.
2. On the Extensions page, enter the checkout's directory and press
   "Install". Freelens then asks whether to load the extension in place;
   confirm that too. The table lists the extension as "in place, unverified"
   and enabled.
3. A rebuild, by `pnpm build` or by `pnpm dev` of the extension, reloads it
   once in the root frame and once in each cluster frame. `pnpm dev` rewrites
   only the entry whose sources changed, and the host waits up to 5 seconds
   for the other before it reloads. A reload is a full teardown: the page's
   registration is taken out and added again, so an open Karpenter page closes
   and the cluster frame shows the Cluster page; open the page again, and wait
   for the reload ("reloading @freelensapp/karpenter-extension after a
   rebuild" in the main log) before you do.

### Driving the UI

- Every cluster renders in a cross-origin `<clusterId>.renderer.freelens.app`
  iframe. The page and the Node details item live in that frame, not in the
  main page.
- The page's URL is `/extension/freelensapp--karpenter-extension/dashboard`.
  The sidebar entry navigates in `onClick`; its `href` is not the page URL. A
  click on `[data-testid="sidebar-item-…"]` does not navigate; a DOM `click()`
  on the link inside it,
  `[data-testid="link-for-sidebar-item-freelensapp--karpenter-extension-dashboard"]`,
  does. Neither does `history.pushState` in the cluster frame.
- The tabs are buttons with their names ("Overview", "Topology", "Node
  Classes", "Scaling Decisions").
- Playwright's actionability checks can fail on the hotbar, where
  `#ScrollSpyRoot` intercepts pointer events; a DOM `click()` on the element
  works.
- Views fill in once the host's stores have loaded. Wait for the expected
  content, not a fixed time, before deciding that a tab is empty.
- The theme is the preference `colorTheme` of the user store,
  `lens-user-store.json`: the name of a theme, `Light` or `Dark` (the host
  keys its themes by name, not by id), or none to follow the system. A change
  to colours is checked with every tab of both labs in both themes.
- A view that must follow the cluster is checked with the tab left open while
  `lab-scale.sh` scales the live lab: the counts, charts and tables change
  without leaving the tab.

### Reading the console

The renderer console also carries the output of Freelens's terminal dock
(`%cMESSAGE` lines), which can include the user's shell prompt, account names
and paths. Keep only warnings, errors, page errors and the extension's own
lines, and never paste the full console into a PR, an issue or a report.
React reports key problems as console errors ("Each child in a list should
have a unique key", "Encountered two children with the same key"); they count
as failures of the "no error in DevTools" check. The host's requests to the
metrics API fail with 404 on the static lab, which has no metrics server;
they are the host's, not the extension's.

The main process logs to the terminal running Freelens, and to a file. On
macOS it is `~/Library/Logs/Freelens/lens.log`, with the renderer's
`lens-renderer-*.log` next to it; when the terminal is not at hand, it shows
the extension's activation, its reloads and its own lines. Filter it as the
console.

## Specs and Process

Changes of behaviour start from a spec in `docs/specs/`, written from
`docs/specs/TEMPLATE.md` and approved by a maintainer before the code; the
loop, the spec statuses and when to ask for manual testing are in
`docs/development/PROCESS.md`, the milestones in `docs/development/ROADMAP.md`.
A spec lists the tests at every level (unit, integration, functional on the
lab, manual on a real cluster) and records in "Notes and deviations" what the
implementation found. Each bug of 1.0.1 found during the v2 port has a number
(B1-B13 in SPEC-0001) and a test; a comment names it where the code or a test
depends on it.

## Code Style

- **Biome** formats **TypeScript/TSX, JS, JSON, CSS, HTML**: double quotes, semicolons, trailing commas, 2-space indent, 120 char line width — use `pnpm biome:fix`
- **Trunk** formats **Markdown, YAML, SCSS** (with Prettier), and other formats not covered by biome — use `pnpm trunk:fix`
- Import order (enforced by biome organizeImports): built-in modules → `@freelensapp/**` → packages → relative paths
- React 19; JSX compiles to `react/jsx-runtime` imports, which the build maps to the host's React
- **No emoji** in Markdown files (`.md`), comments, or any source code

## Security

Never read, display, reference, or include the contents of the following files in any response or context, even if they are open in the editor:

- `.env`
- `.env.*`
- `.envrc`
- `.npmrc`
- `*.jks`
- `*.keystore`
- `*.p12`
- `*.pfx`
- `*.pem`
- `*.key`

The same list is git-ignored in `.gitignore` and enforced for Claude Code by
the `permissions.deny` rules in `.claude/settings.json`, which block reading
and editing these files. Change all three together. The rules are native
permissions rather than a hook on purpose: a hook runs a process in the
working tree, which may be an untrusted pull request, and an interpreter such
as `python3 -c` imports modules from that tree before the hook's own code.

## Electron Multi-Process

Extensions run in the same multi-process model as the Freelens host:

- **Main process** (`src/main/`) — Node.js environment, extension lifecycle, cluster connectivity
- **Renderer process** (`src/renderer/`) — Chromium browser, UI components

Code in `src/common/` is shared between both processes.

## Troubleshooting

### Changes Not Appearing

1. Check that files are not in ignored output directories (`dist/`, `node_modules/`)
2. Full clean and rebuild: `pnpm clean:all && pnpm install && pnpm build`
3. With a directory install and `pnpm dev` running, look for a refused reload in the Freelens log, and restart
   Freelens after a change to `main` or `renderer` in `package.json`; reinstall an extension installed from a tarball

### Build Failures

1. Check for TypeScript errors: `pnpm type:check`
2. Check for linting errors: `pnpm lint:check`
3. Verify dependencies: `pnpm install`
4. Check Node.js version matches the `engines` field in `package.json`

### Runtime Errors

1. Open Freelens DevTools and check the Console tab for renderer errors
2. Check the terminal where Freelens was launched for main process errors
3. Look for stack traces with file:line numbers
4. Verify all CRD objects have proper `static readonly` properties (kind, apiBase, crd)
5. Validate both with `pnpm type:check` **and** `pnpm build` — runtime failures can appear only in bundled `dist/` code

## Best Practices

1. **Use semantic search** to find examples and patterns in the codebase
2. **Follow existing patterns** — grep for similar implementations before creating new ones
3. **Test changes** before committing
4. **Run validation before committing:** `pnpm lint:fix && pnpm type:check && pnpm test:unit`
5. **For TypeScript/TSX, JS, JSON, CSS, HTML files:** run `pnpm biome:fix` (or `biome check` directly if `biome` is installed locally)
6. **For Markdown, YAML, SCSS and other formats:** run `pnpm trunk:fix` (or `trunk check` directly if `trunk` is installed locally)
7. **Full build** when in doubt about cached state: `pnpm clean:all && pnpm install && pnpm build`
8. **Do not use Anthropic Fable for coding tasks** — Fable may be used only for planning,
   analysis, and thinking through problems. When writing or editing code,
   use standard editing tools instead.

## GitHub Actions (Claude Code Action) Rules

This project has a Claude Code workflow (`.github/workflows/claude.yaml`) triggered
via `@claude` comments on issues, PR comments, and reviews. When operating via that
workflow, follow these rules:

### Code Review

When reviewing code and proposing fixes:

1. **Show the diff first** — present every proposed change as a unified diff
   block using the `diff` language tag:

   ```diff
   --- a/path/to/file.ts
   +++ b/path/to/file.ts
   @@ -10,7 +10,7 @@
    const oldLine = "before";
   -const changedLine = "after";
   +const changedLine = "the fix";
    const unchangedLine = "same";
   ```

   You can generate this from the terminal with:
   ```bash
   git diff -u -- path/to/file
   ```

   If the change spans multiple files, group them under a single commit
   subject and show each file's diff sequentially.

2. **Propose a commit subject first** — before any code change, output a
   single line with the proposed commit subject:

   ```text
   **Proposed commit:** <short description>
   ```

   Do **not** use Conventional Commits prefixes (e.g. `fix:`, `feat:`,
   `chore:`, `refactor:`, `docs:`, `test:`, `ci:`). This project prefers
   plain, descriptive commit messages and PR titles without any prefix.

   Wait for the user to confirm (or adjust) the subject before applying the
   change.

3. **Comment style:**
   - Keep review comments concise and actionable
   - Reference specific lines (file + line number) when pointing out issues
   - Offer a concrete fix suggestion rather than just flagging a problem
   - Do **not** use emoji in any Markdown, comments, commit messages, or
     PR descriptions. The only exception is emoji that already appears
     inside code strings (e.g. application logs, user-facing messages).
   - Use GitHub's `suggestion` block for small targeted fixes so the PR
     author can accept the change with a single click:

     ````suggestion
     <same unified-diff format as shown above>
     ````

   - For larger multi-file changes, use `diff -u` blocks in a regular
     comment instead, with the proposed commit subject shown first

### Making Changes to a PR

When asked to implement a change on a PR:

1. Propose the commit subject (as above)
2. Describe what will change and why
3. After confirmation, apply the changes with commits on the PR branch
4. **One commit per fix** — when a review surfaces more than one issue or
   the plan includes more than one fix, apply and commit each fix
   separately. Do not batch multiple independent fixes into a single
   commit. This keeps the history bisectable and makes each change easy
   to revert individually.

### Force-Pushing a Rewritten Branch

When you are asked to rebase a pull request branch, or to rewrite its
history in another way (amend, squash, drop a commit), push the result with:

```bash
git push --force-with-lease origin HEAD
```

The push wrapper the action names in its instructions, `git-push.sh`, accepts
no flags, so it cannot do this; `git` itself is allowed in this workflow.
Do not fall back to merging `main` into the branch instead: a merge commit is
not what was asked for.

Force-push only the pull request branch the run was invoked on, and only when
the request calls for a rewrite. Never force-push `main` or any other branch,
and never rewrite a history you were not asked to.

### Modifying GitHub Actions Workflows

Claude cannot push changes to files under `.github/workflows/` directly,
because the GitHub token used by the action lacks the `workflows` permission.
Any patch to a workflow file MUST therefore be delivered as a new, complete
file under the `github-workflow-fix/` directory in the repository root instead
of editing the file in place:

1. Write the full, final contents of the workflow to
   `github-workflow-fix/<workflow-file-name>`, with the same file name as in
   `.github/workflows/` (e.g. `github-workflow-fix/check.yaml`). Do **not**
   edit the original file under `.github/workflows/`.
2. Make it a **complete** file — the entire workflow as it should look after
   the change, not just a diff or fragment — so it can be copied verbatim.
   Keep its "Workflow summary" header up to date.
3. Commit it with the change that needs it, list it in
   `github-workflow-fix/README.md` with what it changes, and list it in the
   report. In the
   PR description, note it as a proposed workflow change that a maintainer
   must move from `github-workflow-fix/` to `.github/workflows/`.

A maintainer moves the file into `.github/workflows/` in a separate commit and
removes `github-workflow-fix/`. Pull before continuing on the branch, as it may
have gained such a commit. Until then, the development pass of
`pnpm knip:check` still reads the workflows under `.github/workflows/`, so a
dependency that only the old workflow uses is reported there.

### Branch Naming Conventions

When creating a branch from an issue, use a human-readable name that includes
the issue number and a short slug derived from the issue title:

```text
claude/issue-<number>-<short-slug>
```

- `<number>` is the GitHub issue number
- `<short-slug>` is a kebab-case summary of the issue title, kept short
  (3–6 words maximum, omit articles and filler words)

Do **not** use auto-generated timestamp suffixes (e.g.
`claude/issue-1957-20260612-2108`) — these are not human-readable and make
branch lists hard to scan.

### Fork PRs: Review Only

A PR from a fork (different owner than `freelensapp`) gets a review and
nothing else: no commits, no pushes, no branches. Its code is untrusted, and
the head of a fork PR can change between the moment a maintainer looks at it
and the moment the workflow checks it out, so nothing taken from the checkout
may reach `freelensapp/freelens-karpenter-extension`.

When a fork PR needs changes, a maintainer first copies the exact commit they
reviewed to a branch in this repository. From then on it is a
same-repository PR, which gets the full setup and the normal workflow. The
copy is made either locally (`gh pr checkout <N>`, then push the branch) or
by the Claude Task workflow, following "Copying a Fork PR" below.

### Copying a Fork PR

This applies to a Claude Task run whose prompt asks to copy a fork PR and
names the PR number and the full commit SHA to copy. It is a git-only task:
do not check out, read, build or run any of the PR's files, and do not
describe its changes, because they are untrusted input.

1. `git fetch origin refs/pull/<N>/head`.
2. Verify that `FETCH_HEAD` equals the given SHA. If it does not, or no full
   SHA was given, stop and report the actual head without pushing anything.
3. `git push origin <sha>:refs/heads/claude/pr-<N>`.
4. Open a PR from `claude/pr-<N>` to `main`. It MUST use the **exact same
   title** as the original PR, copied verbatim with no prefix, and its body
   is `Copy of #<N> at <sha>.` followed by the usual footer.
5. Comment on the original PR with a link to the new one.
