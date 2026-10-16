import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { useState } from "react";
import { NodeClassesTab } from "../components/NodeClassesTab/NodeClassesTab";
import { ScalingDecisions } from "../components/ScalingDecisions/ScalingDecisions";
import { KarpenterPageLoading } from "../components/shared/LoadingSkeleton";
import { Topology } from "../components/Topology/Topology";
import { getNodeClaimStore, getNodePoolStore, getNodeStore } from "../data/stores";
import { useKarpenterDashboardData } from "../data/use-dashboard-data";
import style from "./dashboard.module.scss";
import { OverviewTab } from "./overview";

type Tab = "overview" | "topology" | "nodeclasses" | "scaling";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "topology", label: "Topology" },
  { id: "nodeclasses", label: "Node Classes" },
  { id: "scaling", label: "Scaling Decisions" },
];

export interface KarpenterDashboardProps {
  extension: Renderer.LensExtension;
}

/**
 * The Karpenter page. An `observer`: it follows the host's stores and API registry, so it shows the dashboard as
 * soon as the cluster serves the Karpenter CRDs, also when they arrive after it has rendered.
 */
export const KarpenterDashboard = observer((_props: KarpenterDashboardProps) => {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const data = useKarpenterDashboardData();

  // ── Karpenter not installed ──────────────────────────────────────────────
  if (data.status === "not-installed") {
    return (
      <Renderer.Component.TabLayout scrollable={false} contentClass={style.tabContent}>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--borderColor, #2d2d2d)",
            marginBottom: 0,
            flexShrink: 0,
          }}
        >
          <button
            style={{
              padding: "10px 22px",
              background: "none",
              border: "none",
              borderBottom: "2px solid #00a7e1",
              color: "var(--textColorPrimary, #fff)",
              cursor: "default",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
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
              <a
                href="https://karpenter.sh/docs/getting-started/"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#00a7e1" }}
              >
                official documentation
              </a>{" "}
              for setup instructions.
            </p>
          </div>
        </div>
      </Renderer.Component.TabLayout>
    );
  }

  const nodePoolStore = getNodePoolStore();
  const nodeStore = getNodeStore();
  const nodeClaimStore = getNodeClaimStore();

  if (data.status === "loading" || !nodePoolStore) {
    return (
      <Renderer.Component.TabLayout scrollable={false} contentClass={style.tabContent}>
        <div className={style.fluxContent}>
          <KarpenterPageLoading />
        </div>
      </Renderer.Component.TabLayout>
    );
  }

  return (
    <Renderer.Component.TabLayout scrollable={false} contentClass={style.tabContent}>
      {/* ── Tab bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--borderColor, #2d2d2d)",
          marginBottom: 0,
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
        <span
          style={{
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
          }}
        >
          Karpenter {data.version}
        </span>
      </div>

      {/* ── Tab content ── */}
      <div className={style.fluxContent}>
        {activeTab === "topology" && (
          <Topology
            nodePools={nodePoolStore.items}
            allNodes={nodeStore.items}
            filterText={search}
            onFilterChange={setSearch}
          />
        )}
        {activeTab === "overview" && (
          <OverviewTab
            nodePools={nodePoolStore.items}
            nodes={nodeStore.items}
            nodeClaims={nodeClaimStore?.items ?? []}
            search={search}
            setSearch={setSearch}
          />
        )}
        {activeTab === "nodeclasses" && <NodeClassesTab />}
        {activeTab === "scaling" && <ScalingDecisions />}
      </div>
    </Renderer.Component.TabLayout>
  );
});
