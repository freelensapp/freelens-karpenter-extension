#!/usr/bin/env bash
# lab-scale.sh <replicas> [batch-replicas]: live lab only. Scale the inflate workloads so that Karpenter
# launches nodes (replicas up) or consolidates them (replicas down).
# shellcheck source=e2e/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
lab_init live
lab_guard

replicas="${1:?replicas of inflate}"
batch="${2:-}"
k -n lab-workloads scale deployment/inflate --replicas="$replicas" >/dev/null
log "inflate -> $replicas"
if [[ -n $batch ]]; then
  k -n lab-workloads scale deployment/inflate-batch --replicas="$batch" >/dev/null
  log "inflate-batch -> $batch"
fi
