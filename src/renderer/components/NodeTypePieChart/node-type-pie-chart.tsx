import { Renderer } from "@freelensapp/extensions";
import React, { useEffect } from "react";
import styleInline from "./node-type-pie-chart.module.scss?inline";
import style from "./node-type-pie-chart.module.scss";
import { Node } from "../../k8s/core/node-store";

export interface NodeTypePieChartProps {
  title: string
  nodes: Node[]
}

export function NodeTypePieChart(props: NodeTypePieChartProps): React.ReactElement {
  const [chartData, setChartData] = React.useState<Renderer.Component.PieChartData | null>(null);
  const { title, nodes } = props;

  useEffect(() => {

    if (!nodes?.length) {
      return
    }

    const types = nodes.reduce((acc, node) => {
      const type = node.metadata.labels?.["node.kubernetes.io/instance-type"];
      if (type) {
        acc[type] = (acc[type] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    const typesArray = Object.entries(types); // [['t3.medium', 4], ['t3.large', 2], ...]
    const labels = typesArray.map(([type, count]) => `${type}: ${count}`);
    const values = typesArray.map(([_, count]) => count);


    // Generate a unique color for each nodePool using HSL
    const goldenAngle = 137.508; // degrees
    const backgroundColor = [
      ...labels.map((_, i) => {
        const hue = (i * goldenAngle) % 360;
        return `hsl(${hue}, 70%, 50%)`;
      }), 
      "#7d7f82"
    ]

    const tooltipLabels = [
      ...labels.map((label) => (percent) => `${label}: ${percent} - ${types[label]}`),
    ]

    setChartData({
      datasets: [
        {
          data: values,
          backgroundColor,
          tooltipLabels,
        },
      ],
      labels,
    } as any)
  }, [nodes])

  if (!chartData) {
    return <div>Loading...</div>;
  }
  return (
    <>
      <style>{styleInline}</style>
      <div className={style.chartItem}>
        <div className={`flex gaps align-center ${style.center}`}>
          <div className="flex flex-col align-center">
            <Renderer.Component.PieChart title={title} data={chartData} />
          </div>
        </div>
      </div>
    </>
  );
}
