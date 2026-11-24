import { Common, Renderer } from "@freelensapp/extensions";
import React, { useState } from "react";
import { drainCommand } from "../../utils/node-commands";
import style from "./node-selection.module.scss";

/** A selection of nodes by name; `selected` keeps only the names still in `names`, in their order. */
export function useNodeSelection(names: string[]) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const selected = names.filter((name) => picked.has(name));
  const allSelected = names.length > 0 && selected.length === names.length;

  return {
    selected,
    allSelected,
    isSelected: (name: string) => picked.has(name),
    toggle: (name: string) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (!next.delete(name)) next.add(name);
        return next;
      }),
    toggleAll: () => setPicked(allSelected ? new Set() : new Set(names)),
    clear: () => setPicked(new Set()),
  };
}

export type NodeSelection = ReturnType<typeof useNodeSelection>;

/** A click with Ctrl or Cmd selects; a plain one opens. */
export const isSelectClick = (event: React.MouseEvent | React.KeyboardEvent) => event.ctrlKey || event.metaKey;

type NodeAction = "cordon" | "uncordon" | "drain" | "delete";

const ACTIONS: { action: NodeAction; label: string; confirm?: boolean }[] = [
  { action: "cordon", label: "Cordon" },
  { action: "uncordon", label: "Uncordon" },
  { action: "drain", label: "Drain", confirm: true },
  { action: "delete", label: "Delete", confirm: true },
];

function apply(action: Exclude<NodeAction, "drain">, name: string) {
  const { nodesApi } = Renderer.K8sApi;
  if (action === "delete") return nodesApi.delete({ name });
  return nodesApi.patch({ name }, { spec: { unschedulable: action === "cordon" } }, "merge");
}

/**
 * The actions of the host's node menu on the selected nodes, Drain and Delete after a confirmation. Cordon, Uncordon
 * and Delete call the API; Drain sends the host's kubectl command to a terminal tab, as the host does.
 */
export function NodeSelectionBar({ selection, className }: { selection: NodeSelection; className?: string }) {
  const { selected, clear } = selection;
  if (selected.length === 0) return null;

  const run = (action: NodeAction, label: string, confirm?: boolean) => {
    const nodes = [...selected];
    const go = async () => {
      clear();
      if (action === "drain") {
        const kubectl = Common.App.Preferences.getKubectlPath() || "kubectl";
        return void Renderer.Component.terminalStore.sendCommand(drainCommand(nodes, kubectl), { enter: true });
      }
      const results = await Promise.allSettled(nodes.map((name) => apply(action, name)));
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          Renderer.Component.Notifications.error(
            `${label} ${nodes[i]}: ${String(result.reason?.message ?? result.reason)}`,
          );
        }
      });
    };
    if (!confirm) return void go();
    Renderer.Component.ConfirmDialog.open({
      ok: () => void go(),
      labelOk: `${label} ${nodes.length === 1 ? "Node" : `${nodes.length} Nodes`}`,
      message: (
        <p>
          {`Are you sure you want to ${action} `}
          <b>{nodes.join(", ")}</b>?
        </p>
      ),
    });
  };

  return (
    <div className={`${style.bar} ${className ?? ""}`} onClick={(e) => e.stopPropagation()}>
      <span className={style.count}>
        {selected.length} node{selected.length === 1 ? "" : "s"} selected
      </span>
      {ACTIONS.map(({ action, label, confirm }) => (
        <button key={action} type="button" className={style.button} onClick={() => run(action, label, confirm)}>
          {label}
        </button>
      ))}
      <button type="button" className={style.button} onClick={clear} title="Clear the selection">
        Clear
      </button>
    </div>
  );
}
