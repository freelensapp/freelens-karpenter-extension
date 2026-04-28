import { Renderer } from "@freelensapp/extensions";

// transpiled .tsx code must have `React` symbol in the scope
import React from "react";

// must be named `*.module.scss` for the default export to work
import style from "./page.module.scss";

// must be `?inline` for explicit CSS to use in `<style>` tag
import styleInline from "./page.module.scss?inline";
import { NodePool, getNodePoolStore } from "../k8s/karpenter/store";
import {
  NodeClaim,
  getNodeClaimStore,
  isClaimingNodeClaim,
  getNodeClaimPoolName,
} from "../k8s/karpenter/store";
import { observer } from "mobx-react";
import { PieChart } from "../components/PieChart/pie-chart";
import { KarpenterCard } from "../components/KarpenterCard/KarpenterCard";
import { getNodeStore } from "../k8s/core/node-store";
import { getEC2NodeClassStore } from "../k8s/karpenter/ec2nodeclass-store";
import { getAKSNodeClassStore } from "../k8s/karpenter/aksNodeclass-store";
import { getKubeEventStore, fetchAllNamespaceEvents } from "../k8s/core/karpenter-events-store";
import { getCrdStore } from "../k8s/core/crd";
import { ScalingDecisions } from "../components/ScalingDecisions/ScalingDecisions";
import { NodeClassesTab } from "../components/NodeClassesTab/NodeClassesTab";
import { ClusterPieView } from "../components/ClusterPieView/ClusterPieView";
import { KarpenterPageLoading } from "../components/shared/LoadingSkeleton";
import { getNodeStatus, getInstanceType } from "../utils/kube-helpers";
import type { CondStatus } from "../utils/kube-helpers";

const {
  // KubeObjectListLayout kept for potential future use
} = Renderer.Component;

interface KarpenterDashboardState {
  nodePools: NodePool[];
  data: number[];
  activeTab: "cluster" | "overview" | "nodeclasses" | "scaling";
  search: string;
  /** undefined = still loading, null = not installed, string = version */
  karpenterVersion: string | null | undefined;
}

@observer
export class KarpenterDashboard extends React.Component<{ extension: Renderer.LensExtension }, KarpenterDashboardState> {
  private readonly watches: (() => void)[] = [];
  private readonly abortController = new AbortController();
  private nodePoolStore?: ReturnType<typeof getNodePoolStore>;
  private nodeStore?: ReturnType<typeof getNodeStore>;
  private nodeClaimStore?: ReturnType<typeof getNodeClaimStore>;
  private ec2NodeClassStore?: ReturnType<typeof getEC2NodeClassStore>;
  private aksNodeClassStore?: ReturnType<typeof getAKSNodeClassStore>;
  private kubeEventStore?: ReturnType<typeof getKubeEventStore>;
  public readonly state: Readonly<KarpenterDashboardState> = {
    nodePools: [],
    data: [],
    activeTab: "cluster",
    search: "",
    karpenterVersion: undefined,
  };

  constructor(props: { extension: Renderer.LensExtension }) {
    super(props);
  }

  componentWillUnmount(): void {
    this.abortController.abort();
    this.watches.forEach((w) => {
      w();
    });
    this.watches.splice(0, this.watches.length);
    this.watches.length = 0;
  }

  componentDidMount() {
    this.initializeDashboard().catch(() => this.setState({ karpenterVersion: null }));
  }

  private async initializeDashboard() {
    try {
      const crdStore = getCrdStore();
      await crdStore.loadAll({ onLoadFailure: () => undefined });
      // Look for nodepools.karpenter.sh CRD — presence confirms Karpenter is installed
      const crd = crdStore.items.find(
        (c) => (c as any).metadata?.name === "nodepools.karpenter.sh"
      );
      if (!crd) {
        this.setState({ karpenterVersion: null });
        return;
      }

      this.nodePoolStore = getNodePoolStore();
      this.nodeStore = getNodeStore();
      this.nodeClaimStore = getNodeClaimStore();
      this.ec2NodeClassStore = getEC2NodeClassStore();
      this.aksNodeClassStore = getAKSNodeClassStore();
      this.kubeEventStore = getKubeEventStore();

      await Promise.all([
        this.nodePoolStore,
        this.nodeStore,
        this.nodeClaimStore,
        this.ec2NodeClassStore,
        this.aksNodeClassStore,
      ].filter((store): store is NonNullable<typeof store> => Boolean(store)).map(async (store) => {
        await store.loadAll({ onLoadFailure: () => undefined });
        this.watches.push(store.subscribe());
      }));

      // Load events explicitly from Karpenter namespaces (events live in "default"),
      // then keep watching. fetchAllNamespaceEvents calls loadAll({namespaces:[...]}) internally.
      await fetchAllNamespaceEvents().catch(() => undefined);
      this.watches.push(this.kubeEventStore.subscribe());

      // 1️⃣ Try to read the karpenter-controller Deployment image tag
      //    (the most reliable source of the real semver, e.g. "1.9.0")
      const version = await this.fetchVersionFromDeployment() ??
        this.extractVersionFromCrd(crd) ??
        "installed";

      this.setState({ karpenterVersion: version });
    } catch {
      this.setState({ karpenterVersion: null });
    }
  }

  /** Fetch karpenter-controller Deployment and parse the controller container image tag.
   *  Uses KubeApi.list() which routes through the Freelens cluster proxy — the only
   *  reliable way to reach the K8s API from an Electron renderer extension. */
  private async fetchVersionFromDeployment(): Promise<string | null> {
    const KubeObject = Renderer.K8sApi.KubeObject;

    // Minimal Deployment KubeObject — we only need the raw JSON shape
    class Deployment extends (KubeObject as any) {
      static readonly kind = "Deployment";
      static readonly namespaced = true;
      static readonly apiBase = "/apis/apps/v1/deployments";
    }

    const deploymentApi = new (Renderer.K8sApi.KubeApi as any)({ objectConstructor: Deployment });

    const namespaces = ["karpenter", "karpenter-system"];
    for (const ns of namespaces) {
      try {
        const items: any[] = await deploymentApi.list({ namespace: ns }).catch(() => null) ?? [];
        if (!Array.isArray(items)) continue;
        for (const dep of items) {
          // Only look at deployments that are likely karpenter-controller
          const name: string = dep?.metadata?.name ?? "";
          if (!name.includes("karpenter")) continue;
          const v = this.parseVersionFromDeploymentObj(dep);
          if (v) return v;
        }
      } catch {
        // try next namespace
      }
    }
    return null;
  }

  /** Extract semver from a Deployment object's container images. */
  private parseVersionFromDeploymentObj(deployment: any): string | null {
    const containers: any[] = [
      ...(deployment?.spec?.template?.spec?.containers ?? []),
      ...(deployment?.spec?.template?.spec?.initContainers ?? []),
    ];
    for (const c of containers) {
      const image: string = c?.image ?? "";
      // image examples:
      //   public.ecr.aws/karpenter/controller:1.9.0
      //   ghcr.io/aws/karpenter/controller:0.37.1
      //   karpenter/controller:v1.2.3
      const match = image.match(/:v?(\d+\.\d+(?:\.\d+)?(?:[-+][^\s]*)?)/);
      if (match) return match[1];
    }
    return null;
  }

  /** Extract version from CRD annotations/labels as fallback. */
  private extractVersionFromCrd(crd: any): string | null {
    const annotations: Record<string, string> = crd?.metadata?.annotations ?? {};
    const labels: Record<string, string> = crd?.metadata?.labels ?? {};
    const raw =
      annotations["karpenter.sh/version"] ||
      annotations["app.kubernetes.io/version"] ||
      labels["app.kubernetes.io/version"] ||
      labels["karpenter.sh/version"] || "";
    if (!raw) return null;
    // Strip leading "v" if present (e.g. "v1.9.0" → "1.9.0")
    return raw.replace(/^v/, "");
  }

  render() {
    const { activeTab, search, karpenterVersion } = this.state;

    // ── Karpenter not installed ──────────────────────────────────────────────
    if (karpenterVersion === null) {
      return (
        <>
          <style>{styleInline}</style>
          <Renderer.Component.TabLayout scrollable={false} contentClass={style.tabContent}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--borderColor, #2d2d2d)", marginBottom: 0, flexShrink: 0 }}>
              <button style={{ padding: "10px 22px", background: "none", border: "none", borderBottom: "2px solid #00a7e1", color: "var(--textColorPrimary, #fff)", cursor: "default", fontSize: 14, fontWeight: 600 }}>
                Overview
              </button>
            </div>
            <div className={style.fluxContent}>
              <div className={style.karpenterNotInstalled}>
                <div className={style.karpenterNotInstalledIcon}>⚠️</div>
                <h2 className={style.karpenterNotInstalledTitle}>Karpenter is not installed</h2>
                <p className={style.karpenterNotInstalledMsg}>
                  No <code>nodepools.karpenter.sh</code> CRD was found in this cluster.
                </p>
                <p className={style.karpenterNotInstalledMsg}>
                  Install Karpenter to manage autoscaling node pools. See the{" "}
                  <a href="https://karpenter.sh/docs/getting-started/" target="_blank" rel="noreferrer" style={{ color: "#00a7e1" }}>
                    official documentation
                  </a>
                  {" "}for setup instructions.
                </p>
              </div>
            </div>
          </Renderer.Component.TabLayout>
        </>
      );
    }

    if (karpenterVersion === undefined || !this.nodePoolStore || !this.nodeStore) {
      return (
        <>
          <style>{styleInline}</style>
          <Renderer.Component.TabLayout scrollable={false} contentClass={style.tabContent}>
            <div className={style.fluxContent}>
              <KarpenterPageLoading />
            </div>
          </Renderer.Component.TabLayout>
        </>
      );
    }

    const nodePoolStore = this.nodePoolStore;
    const nodeStore = this.nodeStore;
    const nodeClaimStore = this.nodeClaimStore;
    const getNodePoolsWithNodes = () => {
      return nodePoolStore.items
        .map(nodePool => {
          const nodes = nodeStore.items.filter(
            node => node.metadata?.labels?.["karpenter.sh/nodepool"] === nodePool.metadata?.name
          );
          return { nodePool, nodes };
        })
        .filter(({ nodes }) => nodes.length > 0);
    };

    const nodePoolsWithNodes = getNodePoolsWithNodes();

    // NodeClaims that have been launched but not yet bound to a Node
    const claimingClaims: NodeClaim[] = nodeClaimStore
      ? nodeClaimStore.items.filter(isClaimingNodeClaim)
      : [];

    const tabs: { id: "cluster" | "overview" | "nodeclasses" | "scaling"; label: string }[] = [
      { id: "cluster",    label: "Cluster View" },
      { id: "overview",   label: "Overview" },
      { id: "nodeclasses", label: "Node Classes" },
      { id: "scaling",    label: "Scaling Decisions" },
    ];

    return (
      <>
        <style>{styleInline}</style>
        <Renderer.Component.TabLayout scrollable={false} contentClass={style.tabContent}>
          {/* ── Tab bar ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--borderColor, #2d2d2d)",
            marginBottom: 0,
            flexShrink: 0,
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => this.setState({ activeTab: tab.id })}
                style={{
                  padding: "10px 22px",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid #00a7e1" : "2px solid transparent",
                  color: activeTab === tab.id ? "var(--textColorPrimary, #fff)" : "var(--textColorSecondary, #888)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
            {/* Karpenter version badge */}
            {karpenterVersion && karpenterVersion !== undefined && (
              <span style={{
                marginLeft: "auto",
                marginRight: 16,
                padding: "2px 10px",
                borderRadius: 12,
                background: "var(--borderColor, #2a2a36)",
                color: "#00a7e1",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                border: "1px solid #00a7e133",
              }}>
                Karpenter {karpenterVersion}
              </span>
            )}
          </div>

          {/* ── Tab content ── */}
          <div className={style.fluxContent}>
            {activeTab === "cluster" && (
              <ClusterPieView
                nodePools={nodePoolStore.items}
                allNodes={nodeStore.items}
              />
            )}
            {activeTab === "overview" && (
              <>
                {renderLimits(nodePoolsWithNodes, nodeStore.items, claimingClaims, search, (name) => {
                  this.setState({ search: name });
                })}
                {renderBody2(nodePoolStore, nodeStore, nodeClaimStore, search, (name) => this.setState({ search: name }))}
              </>
            )}
            {activeTab === "nodeclasses" && (
              <NodeClassesTab />
            )}
            {activeTab === "scaling" && (
              <ScalingDecisions />
            )}
          </div>
        </Renderer.Component.TabLayout>
      </>
    );
  }
}

const renderLimits = (nodePoolsWithNodes: any[], nodes: any[], claimingClaims: NodeClaim[], search: string, onPoolClick: (name: string) => void) => {
  return (
    <div style={{ marginBottom: 16 }}>
      {getOverwiewChart(nodePoolsWithNodes, nodes, claimingClaims, search, onPoolClick)}
    </div>
  );
}

function getOverwiewChart(nodePoolsWithNodes: any[], nodes: any[], claimingClaims: NodeClaim[], search: string, onPoolClick: (name: string) => void) {
  const limits = {
    cpu: "1000m",
    memory: "2000m"
  }
  // Build per-pool claiming counts (claims with no Node yet, grouped by NodePool label)
  const claimingByPool: Record<string, number> = {};
  for (const c of claimingClaims) {
    const pool = getNodeClaimPoolName(c) || "__unknown__";
    claimingByPool[pool] = (claimingByPool[pool] ?? 0) + 1;
  }
  return (
    <div className="row">
      <PieChart
        title={'Overview'}
        objects={nodePoolsWithNodes}
        nodes={nodes}
        limits={limits}
        activePool={search}
        onPoolClick={onPoolClick}
        activeFilter={search}
        onFilterChange={onPoolClick}
        claimingCount={claimingClaims.length}
        claimingByPool={claimingByPool}
      />
    </div>
  );
}

// ── Filter helpers ────────────────────────────────────────────────────────────

const STATUS_QUICK_FILTERS: { status: CondStatus; label: string; color: string }[] = [
  { status: "Ready",        label: "Ready",        color: "#48c78e" },
  { status: "Provisioning", label: "Provisioning", color: "#ffc107" },
  { status: "Claiming",     label: "Claiming",     color: "#5ad1fc" },
  { status: "Terminating",  label: "Terminating",  color: "#ff7043" },
  { status: "NotReady",     label: "Not Ready",    color: "#f14668" },
];

/**
 * Parse a raw search string into name terms and key:value tokens.
 * Supported tokens: status:<value>, type:<value>
 * Everything else is treated as a pool-name substring.
 */
function parseSearchTokens(raw: string) {
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const statusTokens: string[] = [];
  const typeTokens: string[] = [];
  const poolStatusTokens: string[] = [];
  const nameTerms: string[] = [];

  for (const t of tokens) {
    if (t.startsWith("status:")) {
      statusTokens.push(t.slice(7));
    } else if (t.startsWith("type:")) {
      typeTokens.push(t.slice(5));
    } else if (t.startsWith("poolstatus:")) {
      poolStatusTokens.push(t.slice(11));
    } else {
      nameTerms.push(t);
    }
  }
  return { statusTokens, typeTokens, poolStatusTokens, nameTerms };
}

function nodePoolMatchesFilter(
  np: NodePool,
  nodes: any[],
  nameTerms: string[],
  statusTokens: string[],
  typeTokens: string[],
  quickStatuses: CondStatus[],
  poolStatusTokens: string[] = [],
  claims: NodeClaim[] = [],
): boolean {
  const poolName = (np.metadata?.name ?? "").toLowerCase();

  // name filter
  if (nameTerms.length > 0 && !nameTerms.every((t) => poolName.includes(t))) return false;

  // poolstatus: token — filters on the NodePool's own Ready condition
  if (poolStatusTokens.length > 0) {
    const poolStatus = getNodeStatus(np as any).toLowerCase(); // fallback
    const npStatus = (() => {
      const conds: any[] = (np as any).status?.conditions ?? [];
      const ready = conds.find((c: any) => c.type === "Ready");
      if (!ready) return "unknown";
      return ready.status === "True" ? "ready" : "notready";
    })();
    const matches = poolStatusTokens.some((f) => {
      if (f === "notready") return npStatus !== "ready";
      if (f === "ready") return npStatus === "ready";
      return npStatus.includes(f) || poolStatus.includes(f);
    });
    if (!matches) return false;
  }

  // status: token or quick-filter chips
  const allStatusFilters = [
    ...statusTokens,
    ...quickStatuses.map((s) => s.toLowerCase()),
  ];
  if (allStatusFilters.length > 0) {
    const hasMatchingNode = nodes.some((node: any) => {
      const s = getNodeStatus(node).toLowerCase();
      return allStatusFilters.some((f) => s.includes(f));
    });
    // Claiming status matches against pending NodeClaims (no node bound yet)
    const hasMatchingClaim =
      allStatusFilters.some((f) => "claiming".includes(f) || f.includes("claiming")) &&
      claims.length > 0;
    if (!hasMatchingNode && !hasMatchingClaim) return false;
  }

  // type: token
  if (typeTokens.length > 0) {
    const hasMatchingType = nodes.some((node: any) => {
      const t = getInstanceType(node).toLowerCase();
      return typeTokens.some((f) => t.includes(f));
    });
    if (!hasMatchingType) return false;
  }

  return true;
}

// ── NodePool list ─────────────────────────────────────────────────────────────

const NodePoolList: React.FC<{ nodePoolStore: any; nodeStore: any; nodeClaimStore?: any; search: string; setSearch: (v: string) => void }> = observer(({ nodePoolStore, nodeStore, nodeClaimStore, search, setSearch }) => {
  const [showEmpty, setShowEmpty] = React.useState(false);
  const [quickStatuses, setQuickStatuses] = React.useState<CondStatus[]>([]);

  const allNodePools: NodePool[] = nodePoolStore.items;

  const { statusTokens, typeTokens, poolStatusTokens, nameTerms } = parseSearchTokens(search);

  const toggleQuickStatus = (s: CondStatus) =>
    setQuickStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  // All NodeClaims that haven't yet been bound to a Node — grouped by pool below
  const claimingClaims: NodeClaim[] = nodeClaimStore
    ? (nodeClaimStore.items as NodeClaim[]).filter(isClaimingNodeClaim)
    : [];

  const claimsByPool = React.useMemo(() => {
    const map: Record<string, NodeClaim[]> = {};
    for (const c of claimingClaims) {
      const pool = getNodeClaimPoolName(c);
      if (!pool) continue;
      (map[pool] ??= []).push(c);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimingClaims.length, claimingClaims.map((c) => c.metadata?.name).join(",")]);

  const allFiltered = allNodePools.filter((np: NodePool) => {
    const nodes = nodeStore.items.filter(
      (node: any) => node.metadata?.labels?.["karpenter.sh/nodepool"] === np.metadata?.name
    );
    const claims = claimsByPool[np.metadata?.name ?? ""] ?? [];
    return nodePoolMatchesFilter(np, nodes, nameTerms, statusTokens, typeTokens, quickStatuses, poolStatusTokens, claims);
  });

  const nodePools = showEmpty
    ? allFiltered
    : allFiltered.filter((np: NodePool) => {
        const poolName = np.metadata?.name ?? "";
        const nodeCount = nodeStore.items.filter(
          (node: any) => node.metadata?.labels?.["karpenter.sh/nodepool"] === poolName
        ).length;
        // Keep pools that have either nodes OR claiming NodeClaims
        return nodeCount > 0 || (claimsByPool[poolName]?.length ?? 0) > 0;
      });

  const emptyCount = allNodePools.filter((np: NodePool) => {
    const poolName = np.metadata?.name ?? "";
    const nodeCount = nodeStore.items.filter(
      (node: any) => node.metadata?.labels?.["karpenter.sh/nodepool"] === poolName
    ).length;
    return nodeCount === 0 && (claimsByPool[poolName]?.length ?? 0) === 0;
  }).length;

  const hasActiveFilter = search.trim() !== "" || quickStatuses.length > 0;

  return (
    <div className={style.nodePoolList}>
      {/* Header */}
      <div className={style.nodePoolListHeader}>
        <span>NodePools</span>
        <span className={style.nodePoolCount}>{nodePools.length}</span>

        {/* Search input */}
        <div className={style.nodePoolSearchWrap}>
          <input
            className={style.nodePoolSearch}
            type="text"
            placeholder="Filter… (name, status:ready, type:m5.xlarge)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <button className={style.nodePoolSearchClear} onClick={() => setSearch("")} title="Clear">✕</button>
          )}
        </div>

        {/* Status quick-filter chips */}
        <div className={style.quickFilters}>
          {STATUS_QUICK_FILTERS.map(({ status, label, color }) => {
            const active = quickStatuses.includes(status);
            return (
              <button
                key={status}
                className={`${style.quickFilterChip}${active ? ` ${style.quickFilterChipActive}` : ""}`}
                style={active ? { borderColor: color, color, background: `${color}22` } : { color }}
                onClick={() => toggleQuickStatus(status)}
                title={`Show only pools with ${label} nodes`}
              >
                ● {label}
              </button>
            );
          })}
        </div>

        {emptyCount > 0 && (
          <button
            onClick={() => setShowEmpty(v => !v)}
            className={`${style.nodePoolEmptyBtn}${showEmpty ? ` ${style.nodePoolEmptyBtnActive}` : ""}`}
            title={showEmpty ? "Hide NodePools with no nodes" : "Show NodePools with no nodes"}
          >
            {showEmpty ? "Hide empty" : `+${emptyCount} empty`}
          </button>
        )}
      </div>

      {nodePools.map((nodePool: NodePool) => {
        const poolName = nodePool.metadata?.name ?? "";
        const nodes = nodeStore.items.filter(
          (node: any) => node.metadata?.labels?.["karpenter.sh/nodepool"] === poolName
        );
        const claims = claimsByPool[poolName] ?? [];
        return (
          <div key={nodePool.metadata?.uid ?? nodePool.metadata?.name} className={style.nodePoolRow}>
            <KarpenterCard
              nodePool={nodePool}
              nodes={nodes}
              claims={claims}
              nodeStore={nodeStore}
            />
          </div>
        );
      })}

      {nodePools.length === 0 && hasActiveFilter && (
        <div className={style.noResults}>
          No NodePools match the current filters.
        </div>
      )}
    </div>
  );
});

const renderBody2 = (
  nodePoolStore: any,
  nodeStore: any,
  nodeClaimStore: any,
  search: string,
  setSearch: (v: string) => void,
) => <NodePoolList nodePoolStore={nodePoolStore} nodeStore={nodeStore} nodeClaimStore={nodeClaimStore} search={search} setSearch={setSearch} />;
/*
const renderBody = (nodePoolsWithNodes: any[]) => {
  // Split nodePoolsWithNodes in chunks of 2
  const rows: any[][] = [];
  for (let i = 0; i < nodePoolsWithNodes.length; i += 2) {
    rows.push(nodePoolsWithNodes.slice(i, i + 2));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          style={{
            display: "flex",
            gap: 6,
            width: "100%",
          }}
        >
          {row.map((nodePoolsWithNode, colIdx) => (
            <div
              key={colIdx}
              style={{
                flex: rows.length === 1
                  ? "1 1 0%"
                  : row.length === 2
                  ? "1 1 50%"
                  : "1 1 100%",
                maxWidth: rows.length === 1
                  ? "100%"
                  : row.length === 2
                  ? "50%"
                  : "100%",
              }}
            >
              <KarpenterCard
                nodePool={nodePoolsWithNode.nodePool}
                nodes={nodePoolsWithNode.nodes}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );

};*/
