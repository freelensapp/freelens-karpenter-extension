// The slices of the Overview donut and the dots of its NodePool breakdown: pure, so that they are tested on their own.

import { COLOR, STATUS_BORDER_COLOR } from "../../config/theme";
import { getNodePoolStatus } from "../../utils/kube-helpers";

import type { Renderer } from "@freelensapp/extensions";

import type { NodePool } from "../../api/nodepool/nodepool-v1";
import type { OverviewStats } from "./overview-stats";

export interface OverviewSlice {
  label: string;
  /** The number of nodes. */
  value: number;
  /** A fixed colour: the canvas of the chart takes no CSS variable. */
  color: string;
  /** The text of the tooltip, with the share of the slice as the chart computes it. */
  tooltip: (percent: string) => string;
}

/**
 * The slices of the donut: the Karpenter nodes by status, in the colours of the stat boxes and of the status filter,
 * and the other nodes in grey. A status with no node has no slice. The donut counts nodes, so the NodeClaims still
 * claiming are not a slice.
 */
export function computeOverviewSlices(stats: OverviewStats): OverviewSlice[] {
  const slices: Omit<OverviewSlice, "tooltip">[] = [
    { label: "Ready", value: stats.ready, color: COLOR.success },
    { label: "Provisioning", value: stats.provisioning, color: COLOR.warning },
    { label: "Terminating", value: stats.terminating, color: COLOR.terminating },
    { label: "Not Ready", value: stats.notReady, color: COLOR.danger },
    { label: "Non-Karpenter", value: stats.nonKarpenter, color: COLOR.neutral },
  ];

  return slices
    .filter((slice) => slice.value > 0)
    .map((slice) => ({ ...slice, tooltip: (percent: string) => `${slice.label}: ${percent}` }));
}

/** The data of `Renderer.Component.PieChart` for the slices. */
export function overviewChartData(slices: OverviewSlice[]): Renderer.Component.PieChartData {
  return {
    datasets: [
      {
        data: slices.map((slice) => slice.value),
        backgroundColor: slices.map((slice) => slice.color),
        tooltipLabels: slices.map((slice) => slice.tooltip),
      },
    ],
    labels: slices.map((slice) => `${slice.label}: ${slice.value}`),
  };
}

/** The dot of a NodePool in the breakdown: the status of the NodePool, in the colour of its card. */
export function nodePoolDotColor(nodePool: NodePool): string {
  return STATUS_BORDER_COLOR[getNodePoolStatus(nodePool)];
}
