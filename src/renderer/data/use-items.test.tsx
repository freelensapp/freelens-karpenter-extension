// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { useMemo } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { itemsKey, useItems } from "./use-items";

class Item {
  constructor(
    readonly id: string,
    readonly version: string,
    readonly value: number,
  ) {}
  getId() {
    return this.id;
  }
  getResourceVersion() {
    return this.version;
  }
}

afterEach(cleanup);

describe("itemsKey", () => {
  it("changes when an item is added, removed, reordered or updated", () => {
    const a = new Item("a", "1", 1);
    const b = new Item("b", "1", 2);
    const key = itemsKey([a, b]);
    expect(itemsKey([a, b])).toBe(key);
    expect(itemsKey([a])).not.toBe(key);
    expect(itemsKey([b, a])).not.toBe(key);
    expect(itemsKey([a, new Item("b", "2", 3)])).not.toBe(key);
  });
});

describe("useItems", () => {
  // The host's stores keep one observable array and replace its contents.
  const items = observable.array<Item>([], { deep: false });

  const Sum = observer(() => {
    const snapshot = useItems(items);
    const sum = useMemo(() => snapshot.reduce((total, item) => total + item.value, 0), [snapshot]);
    return <p>sum {sum}</p>;
  });

  it("gives the memos a new array when the store's items change in place", () => {
    runInAction(() => items.replace([new Item("a", "1", 1), new Item("b", "1", 2)]));
    render(<Sum />);
    expect(screen.getByText("sum 3")).toBeTruthy();

    act(() => runInAction(() => items.splice(1, 1, new Item("b", "2", 10))));
    expect(screen.getByText("sum 11")).toBeTruthy();

    act(() => runInAction(() => items.replace([new Item("a", "1", 1)])));
    expect(screen.getByText("sum 1")).toBeTruthy();
  });
});
