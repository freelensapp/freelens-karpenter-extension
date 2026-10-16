// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TimelineChart } from "./timeline-chart";

import type { TimelinePoint } from "../../utils/karpenter-events";

const T0 = Date.parse("2026-10-16T08:00:00Z");
const BUCKET = 5 * 60_000;
const points: TimelinePoint[] = [
  { t: T0, counts: {} },
  { t: T0 + BUCKET, counts: { "scale-up": 2, error: 1 } },
  { t: T0 + 2 * BUCKET, counts: {} },
  { t: T0 + 3 * BUCKET, counts: { "scale-down": 1 } },
];
const series = [
  { key: "scale-up", label: "Scale up", color: "green" },
  { key: "scale-down", label: "Scale down", color: "orange" },
  { key: "error", label: "Errors", color: "red" },
];

// The chart is 800 wide until a ResizeObserver says otherwise, with 36 on the left and 8 on the right for the
// axes, so each of the 4 buckets is 189 wide.
const bucketX = (i: number) => 36 + i * 189 + 90;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 160,
  } as DOMRect);
});

afterEach(cleanup);

const svg = (container: HTMLElement) => container.querySelector("svg")!;

describe("TimelineChart", () => {
  it("shows the counts of the bucket under the pointer, and nothing once it leaves", () => {
    const { container } = render(<TimelineChart points={points} series={series} bucketMs={BUCKET} />);

    fireEvent.mouseMove(svg(container), { clientX: bucketX(1) });
    expect(screen.getByText("Scale up:")).toBeTruthy();
    expect(screen.getByText("Errors:")).toBeTruthy();
    expect(screen.queryByText("Scale down:")).toBeNull();

    fireEvent.mouseMove(svg(container), { clientX: bucketX(2) });
    expect(screen.getByText("(no events)")).toBeTruthy();

    fireEvent.mouseLeave(svg(container));
    expect(screen.queryByText("(no events)")).toBeNull();
  });

  it("selects the bucket clicked, and clears it on a second click", () => {
    const onSelectBucket = vi.fn();
    const { container, rerender } = render(
      <TimelineChart points={points} series={series} bucketMs={BUCKET} onSelectBucket={onSelectBucket} />,
    );

    fireEvent.mouseMove(svg(container), { clientX: bucketX(3) });
    fireEvent.click(svg(container));
    expect(onSelectBucket).toHaveBeenLastCalledWith(T0 + 3 * BUCKET);

    rerender(
      <TimelineChart
        points={points}
        series={series}
        bucketMs={BUCKET}
        onSelectBucket={onSelectBucket}
        selectedT={T0 + 3 * BUCKET}
      />,
    );
    fireEvent.click(svg(container));
    expect(onSelectBucket).toHaveBeenLastCalledWith(null);
  });

  it("shows the bucket of a time hovered elsewhere, such as a row of the tables", () => {
    render(<TimelineChart points={points} series={series} bucketMs={BUCKET} externalHoverT={T0 + 3 * BUCKET + 1000} />);
    expect(screen.getByText("Scale down:")).toBeTruthy();
  });

  it("goes from no points to points and back", () => {
    const { rerender } = render(<TimelineChart points={[]} series={series} bucketMs={BUCKET} />);
    expect(screen.getByText("No events in the selected range")).toBeTruthy();

    rerender(<TimelineChart points={points} series={series} bucketMs={BUCKET} externalHoverT={T0} />);
    expect(screen.queryByText("No events in the selected range")).toBeNull();

    rerender(<TimelineChart points={[]} series={series} bucketMs={BUCKET} />);
    expect(screen.getByText("No events in the selected range")).toBeTruthy();
  });
});
