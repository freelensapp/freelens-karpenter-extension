/** The kubectl command of the host's own Drain of a node, for several nodes. */
export function drainCommand(names: string[], kubectl = "kubectl"): string {
  return `${kubectl} drain ${names.join(" ")} --delete-emptydir-data --ignore-daemonsets --force`;
}
