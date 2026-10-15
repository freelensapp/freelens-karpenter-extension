#!/usr/bin/env bash
# lab-aks-v1alpha2.sh on|off: static lab only. Serve AKSNodeClass v1alpha2 next to v1beta1 (on), or only
# v1beta1 as the Azure provider v1.14.5 does (off). The objects are stored as v1beta1 either way.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
lab_init static
lab_guard

mode="${1:?on|off}"
case "$mode" in on) served=true ;; off) served=false ;; *) die "on|off" ;; esac

crd=aksnodeclasses.karpenter.azure.com
index="$(k get crd "$crd" -o json | python3 -c 'import json,sys; v=json.load(sys.stdin)["spec"]["versions"]; print([x["name"] for x in v].index("v1alpha2"))')"
k patch crd "$crd" --type=json -p "[{\"op\":\"replace\",\"path\":\"/spec/versions/$index/served\",\"value\":$served}]" >/dev/null
log "AKSNodeClass v1alpha2 served: $served"
k get crd "$crd" -o jsonpath='{range .spec.versions[*]}{.name}={.served} {end}{"\n"}'
