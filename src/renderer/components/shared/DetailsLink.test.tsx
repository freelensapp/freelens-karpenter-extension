// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailsLink } from "./DetailsLink";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DetailsLink", () => {
  it("opens the details over the page, and keeps the click from the row it is in", () => {
    const rowClick = vi.fn();
    render(
      // A stand-in for the row of the host's table.
      <div onClick={rowClick}>
        <DetailsLink selfLink="/apis/karpenter.sh/v1/nodepools/general">general</DetailsLink>
      </div>,
    );

    // fireEvent returns false when the default is prevented: the host's drawer would otherwise take the click for
    // one outside itself.
    expect(fireEvent.click(screen.getByText("general"))).toBe(false);
    expect(Renderer.Navigation.showDetails).toHaveBeenLastCalledWith("/apis/karpenter.sh/v1/nodepools/general");
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("is the text alone without a selfLink", () => {
    render(<DetailsLink selfLink="">general</DetailsLink>);

    fireEvent.click(screen.getByText("general"));

    expect(screen.queryByRole("link")).toBeNull();
    expect(Renderer.Navigation.showDetails).not.toHaveBeenCalled();
  });
});
