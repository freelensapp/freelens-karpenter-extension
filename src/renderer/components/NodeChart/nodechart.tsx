/*import * as d3 from "d3";

interface LinePlotProps {
  data: number[];
  width?: number;
  height?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
}

export default function LinePlot({
  data,
  width = 640,
  height = 400,
  marginTop = 20,
  marginRight = 20,
  marginBottom = 20,
  marginLeft = 20,
}: LinePlotProps) {
  const x = d3.scaleLinear()
    .domain([0, data.length - 1])
    .range([marginLeft, width - marginRight]);
  const y = d3.scaleLinear()
    .domain(d3.extent(data) as [number, number])
    .range([height - marginBottom, marginTop]);
  const line = d3.line<number>()
    .x((_, i) => x(i))
    .y(d => y(d));

  return (
    <svg width={width} height={height}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        d={line(data) || undefined}
      />
      <g fill="white" stroke="currentColor" strokeWidth={1.5}>
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d)} r={2.5} />
        ))}
      </g>
    </svg>
  );
}*/