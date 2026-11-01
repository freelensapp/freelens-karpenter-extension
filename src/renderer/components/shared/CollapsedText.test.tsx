// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollapsedText } from "./CollapsedText";

afterEach(() => {
  cleanup();
});

describe("CollapsedText", () => {
  it("shows the summary, with the text collapsed under it", () => {
    const { container } = render(
      <CollapsedText name="User Data" text={"#!/bin/bash\necho hello\n"} summary="2 lines" />,
    );

    expect(screen.getByText("User Data")).toBeTruthy();
    expect(screen.getByText("2 lines").tagName).toBe("SUMMARY");
    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.querySelector("pre")?.textContent).toBe("#!/bin/bash\necho hello\n");
  });

  it("is nothing without a text", () => {
    render(<CollapsedText name="User Data" text={undefined} summary="0 lines" />);

    expect(screen.queryByText("User Data")).toBeNull();
  });
});
