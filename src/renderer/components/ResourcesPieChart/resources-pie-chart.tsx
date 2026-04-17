import { Renderer } from "@freelensapp/extensions";
import React, { useEffect } from "react";
import style from "./resources-pie-chart.module.scss";
import styleInline from "./resources-pie-chart.module.scss?inline";

export interface ResourcesPieChartProps {
  title: string
  limits: {
    cpu: string | number
    memory: string | number;
  }
  resources: {
    cpu: string;
    memory: string;
    nodes: string;
    pods: string;
  }
}

export function ResourcesPieChart(props: ResourcesPieChartProps): React.ReactElement {
  const [chartData, setChartData] = React.useState<Renderer.Component.PieChartData | null>(null);
  const { title, limits, resources } = props;
  const backgroundColors = {
    cpu: "#26a822", // Green for CPU
    memory: "#a8228f", // Purple for Memory
  }
  useEffect(() => {
    const cpuUsage = parseFloat(resources.cpu);
    const cpuLimit = typeof limits.cpu === "string" ? parseFloat(limits.cpu) : limits.cpu;
    const memUsage = parseMemory(resources.memory);
    const memLimit = typeof limits.memory === "string" ? parseMemory(limits.memory) : limits.memory;

    const labels = [
      `CPU: ${cpuUsage} / ${limits.cpu}`,
      `Memory: ${formatMemory(memUsage, 'Gi')} / ${limits.memory}`,
    ]
    setChartData({
      datasets: [
      {
          id: 1,
          data: [cpuUsage, cpuLimit - cpuUsage],
          backgroundColor: [backgroundColors["cpu"]],
          tooltipLabels: [
            (percent) => `CPU: ${percent}`,
          ]
      }, 
      {
          id: 2,
          data: [memUsage, memLimit - memUsage],
          backgroundColor: [backgroundColors["memory"]],
          tooltipLabels: [
            (percent) => `Memory: ${percent}`,
          ]
        }
      ],
      labels,
    } as any)
  }, [limits, resources])
  

  const formatMemory = (value: number, unit: "Ki" | "Mi" | "Gi" | "Ti" = "Gi", fixed: number = 2): string => {
    if (unit === "Ki") return `${Math.round(value * 1024 * 1024)}Ki`;
    if (unit === "Mi") return `${Math.round(value * 1024)}Mi`;
    if (unit === "Gi") return `${value.toFixed(fixed)}Gi`;
    if (unit === "Ti") return `${(value / 1024).toFixed(fixed)}Ti`;
    return `${value}`;
  };

  const parseMemory = (mem: string): number => {
    if (mem.endsWith("Ki")) return parseFloat(mem) / (1024 * 1024);
    if (mem.endsWith("Mi")) return parseFloat(mem) / 1024;
    if (mem.endsWith("Gi")) return parseFloat(mem);
    if (mem.endsWith("Ti")) return parseFloat(mem) * 1024;
    return parseFloat(mem);
  }

  if (!chartData) {
    return <div>Loading...</div>;
  } else {
    return (
      <>
        <style>{styleInline}</style>
        <div className={style.chartItem}>
          <div className={`flex gaps align-center ${style.center}`}>
            <div className="flex flex-col align-center">
              <Renderer.Component.PieChart legendColors={['#26a822', '#a8228f']} title={title} data={chartData} />
            </div>
          </div>
        </div>
      </>
    );
  }
}