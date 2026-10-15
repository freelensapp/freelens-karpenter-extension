#!/usr/bin/env bash
# Shared settings and safety checks of the local lab (docs/specs/SPEC-0002-local-lab.md).
# Sourced by the other scripts; never acts on the user's kubeconfig.

# The settings below are used by the scripts that source this file.
# shellcheck disable=SC2034

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_DIR="$REPO_ROOT/e2e"
STATE_ROOT="$REPO_ROOT/.e2e"

KIND_VERSION="v0.33.0"
KARPENTER_VERSION="v1.15.0"
AWS_PROVIDER_VERSION="v1.15.0"
AZURE_PROVIDER_VERSION="v1.14.5"
KWOK_VERSION="v0.8.0"
METRICS_SERVER_VERSION="v0.9.0"

KARPENTER_CRDS_URL="https://raw.githubusercontent.com/kubernetes-sigs/karpenter/refs/tags/$KARPENTER_VERSION/pkg/apis/crds"
AWS_CRDS_URL="https://raw.githubusercontent.com/aws/karpenter-provider-aws/refs/tags/$AWS_PROVIDER_VERSION/pkg/apis/crds"
AZURE_CRDS_URL="https://raw.githubusercontent.com/Azure/karpenter-provider-azure/refs/tags/$AZURE_PROVIDER_VERSION/pkg/apis/crds"
KWOK_RELEASE_URL="https://github.com/kubernetes-sigs/kwok/releases/download/$KWOK_VERSION"
METRICS_SERVER_URL="https://github.com/kubernetes-sigs/metrics-server/releases/download/$METRICS_SERVER_VERSION/components.yaml"

log() { printf '[lab %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# lab_init <profile>: sets PROFILE, CLUSTER_NAME, STATE_DIR, KUBECONFIG (the lab's file only).
lab_init() {
  PROFILE="${1:?profile: static|live}"
  case "$PROFILE" in static | live) ;; *) die "unknown profile: $PROFILE" ;; esac
  CLUSTER_NAME="karpenter-lab-$PROFILE"
  STATE_DIR="$STATE_ROOT/$PROFILE"
  mkdir -p "$STATE_DIR"
  # Every kubectl, helm and upstream script below reads this file and nothing else.
  export KUBECONFIG="$STATE_DIR/kubeconfig"
  export KIND_CLUSTER_NAME="$CLUSTER_NAME"
  command -v kind >/dev/null || die "kind not found"
  local v
  v="$(kind version | awk '{print $2}')"
  [[ "$v" == "$KIND_VERSION" ]] || log "warning: kind $v, the lab is pinned to $KIND_VERSION"
}

# lab_guard: refuse to continue unless KUBECONFIG is the lab's and points at the local kind cluster.
lab_guard() {
  [[ "$KUBECONFIG" == "$STATE_DIR/kubeconfig" ]] || die "KUBECONFIG is not the lab's"
  [[ -f "$KUBECONFIG" ]] || die "no lab kubeconfig at $KUBECONFIG"
  local ctx server
  ctx="$(kubectl config current-context)"
  [[ "$ctx" == "kind-$CLUSTER_NAME" ]] || die "context is '$ctx', expected 'kind-$CLUSTER_NAME'"
  [[ "$(kubectl config get-contexts -o name | wc -l)" -eq 1 ]] || die "the lab kubeconfig has more than one context"
  server="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
  [[ "$server" =~ ^https://(127\.0\.0\.1|localhost|\[::1\]): ]] || die "server '$server' is not local"
}

k() { lab_guard && kubectl --context "kind-$CLUSTER_NAME" "$@"; }

cluster_exists() { kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; }

# apply_numbered <dir>: apply NN-*.yaml in order. A file named *-status.yaml is applied to the status
# subresource. ${LAB_T_M<n>} in a file becomes the time n minutes ago (UTC), for events and conditions.
apply_numbered() {
  local dir="$1" f n vars=""
  for n in $(cat "$dir"/[0-9][0-9]-*.yaml | grep -oE 'LAB_T_M[0-9]+' | sort -u | sed 's/LAB_T_M//'); do
    export "LAB_T_M$n=$(date -u -d "-$n minutes" +%Y-%m-%dT%H:%M:%SZ)"
    vars+=" \$LAB_T_M$n"
  done
  for f in "$dir"/[0-9][0-9]-*.yaml; do
    [[ -e "$f" ]] || continue
    log "apply $(basename "$f")"
    if [[ "$f" == *-status.yaml ]]; then
      envsubst "$vars" <"$f" | k apply --server-side --force-conflicts --field-manager=karpenter-lab --subresource=status -f - >/dev/null
    else
      envsubst "$vars" <"$f" | k apply --server-side --force-conflicts --field-manager=karpenter-lab -f - >/dev/null
    fi
  done
}
