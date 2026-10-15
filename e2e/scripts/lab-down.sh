#!/usr/bin/env bash
# lab-down.sh static|live: delete the lab cluster of the profile and its state. Nothing else.
# shellcheck source=e2e/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
lab_init "${1:-}"

if cluster_exists; then
  log "deleting kind cluster $CLUSTER_NAME"
  kind delete cluster --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG"
else
  log "no kind cluster $CLUSTER_NAME"
fi
rm -rf "$STATE_DIR"
