#!/usr/bin/env bash
# lab-up.sh static|live: create the lab cluster of the profile, install what it runs, apply its
# fixtures and wait until they are in their expected state. Idempotent. See SPEC-0002.
# shellcheck source=e2e/scripts/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
lab_init "${1:-}"

LAB_IMAGE="karpenter-lab/karpenter-kwok:$KARPENTER_VERSION"
KARPENTER_SRC="$STATE_ROOT/src/karpenter"

create_cluster() {
  if cluster_exists && [[ -f $KUBECONFIG ]]; then
    log "kind cluster $CLUSTER_NAME exists"
  else
    cluster_exists && die "kind cluster $CLUSTER_NAME exists without the lab kubeconfig; run lab-down.sh $PROFILE"
    log "creating kind cluster $CLUSTER_NAME"
    kind create cluster --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG" \
      --config "$E2E_DIR/kind-config.yaml" --wait 180s
  fi
  lab_guard
}

apply_url() { k apply --server-side --force-conflicts --field-manager=karpenter-lab -f "$1" >/dev/null; }

install_karpenter_crds() {
  log "Karpenter $KARPENTER_VERSION CRDs"
  for crd in karpenter.sh_nodepools karpenter.sh_nodeclaims karpenter.sh_nodeoverlays; do
    apply_url "$KARPENTER_CRDS_URL/$crd.yaml"
  done
}

install_provider_crds() {
  log "EC2NodeClass ($AWS_PROVIDER_VERSION) and AKSNodeClass ($AZURE_PROVIDER_VERSION) CRDs"
  apply_url "$AWS_CRDS_URL/karpenter.k8s.aws_ec2nodeclasses.yaml"
  apply_url "$AZURE_CRDS_URL/karpenter.azure.com_aksnodeclasses.yaml"
}

install_kwok_plain() {
  log "KWOK $KWOK_VERSION controller and fast stages"
  apply_url "$KWOK_RELEASE_URL/kwok.yaml"
  apply_url "$KWOK_RELEASE_URL/stage-fast.yaml"
  k -n kube-system rollout status deployment/kwok-controller --timeout=180s >/dev/null
}

ensure_karpenter_source() {
  if [[ ! -d "$KARPENTER_SRC/.git" ]]; then
    log "cloning kubernetes-sigs/karpenter $KARPENTER_VERSION"
    git clone -q --depth 1 --branch "$KARPENTER_VERSION" https://github.com/kubernetes-sigs/karpenter.git "$KARPENTER_SRC"
  fi
  [[ "$(git -C "$KARPENTER_SRC" describe --tags)" == "$KARPENTER_VERSION" ]] || die "$KARPENTER_SRC is not at $KARPENTER_VERSION"
}

build_karpenter_image() {
  if docker image inspect "$LAB_IMAGE" >/dev/null 2>&1; then
    log "image $LAB_IMAGE present"
    return
  fi
  command -v ko >/dev/null || die "ko not found (see the lab's mise.toml)"
  log "building the Karpenter KWOK provider image with ko"
  local ref
  ref="$(cd "$KARPENTER_SRC" && KO_DOCKER_REPO=ko.local ko build --bare --platform=linux/amd64 sigs.k8s.io/karpenter/kwok)"
  docker tag "$ref" "$LAB_IMAGE"
}

install_karpenter_kwok() {
  log "KWOK controller as Karpenter's KWOK provider expects it (hack/install-kwok.sh)"
  lab_guard
  (cd "$KARPENTER_SRC" && bash hack/install-kwok.sh >/dev/null)
  log "loading $LAB_IMAGE into $CLUSTER_NAME"
  kind load docker-image "$LAB_IMAGE" --name "$CLUSTER_NAME" >/dev/null
  log "Karpenter $KARPENTER_VERSION with the KWOK provider"
  for crd in "$KARPENTER_SRC"/kwok/charts/crds/*.yaml; do apply_url "$crd"; done
  lab_guard
  helm upgrade --install karpenter "$KARPENTER_SRC/kwok/charts" --kube-context "kind-$CLUSTER_NAME" \
    --namespace kube-system --skip-crds --wait --timeout 5m \
    --set controller.image.repository="${LAB_IMAGE%:*}" \
    --set controller.image.tag="${LAB_IMAGE##*:}" \
    --set controller.image.digest="" \
    --set settings.featureGates.staticCapacity=false \
    --set settings.featureGates.capacityBuffer=false \
    --set serviceMonitor.enabled=false >/dev/null
  # The two gates above are rendered by the v1.15.0 KWOK chart but missing from its values.yaml;
  # without them FEATURE_GATES has "StaticCapacity=" and the controller panics at start.
}

# Karpenter makes each NodeClaim owned by its NodePool and each node by its NodeClaim; the uids only
# exist once the objects are created, so the static lab links them here.
link_owners() {
  log "linking nodes to their NodeClaims and NodeClaims to their NodePools"
  local claim pool node claim_uid pool_uid
  while read -r claim pool node; do
    claim_uid="$(k get nodeclaim "$claim" -o jsonpath='{.metadata.uid}')"
    pool_uid="$(k get nodepool "$pool" -o jsonpath='{.metadata.uid}')"
    k patch nodeclaim "$claim" --type=merge -p "{\"metadata\":{\"ownerReferences\":[{\"apiVersion\":\"karpenter.sh/v1\",\"kind\":\"NodePool\",\"name\":\"$pool\",\"uid\":\"$pool_uid\",\"blockOwnerDeletion\":true}]}}" >/dev/null
    [[ -n $node && $node != "<none>" ]] || continue
    k patch node "$node" --type=merge -p "{\"metadata\":{\"ownerReferences\":[{\"apiVersion\":\"karpenter.sh/v1\",\"kind\":\"NodeClaim\",\"name\":\"$claim\",\"uid\":\"$claim_uid\",\"blockOwnerDeletion\":true}]}}" >/dev/null
  done < <(k get nodeclaims -o jsonpath='{range .items[*]}{.metadata.name} {.metadata.labels.karpenter\.sh/nodepool} {.status.nodeName}{"\n"}{end}')
}

wait_static() {
  log "waiting for the KWOK nodes and the pods"
  k wait --for=condition=Ready node -l karpenter.sh/initialized=true --timeout=120s >/dev/null
  k -n team-a wait --for=jsonpath='{.status.phase}'=Running pod --all --timeout=120s >/dev/null
}

install_metrics_server() {
  log "metrics-server $METRICS_SERVER_VERSION"
  apply_url "$METRICS_SERVER_URL"
  k -n kube-system patch deployment metrics-server --type=json \
    -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' >/dev/null 2>&1 || true
  k -n kube-system rollout status deployment/metrics-server --timeout=180s >/dev/null
}

case "$PROFILE" in
  live)
    ensure_karpenter_source
    build_karpenter_image
    create_cluster
    install_karpenter_kwok
    install_provider_crds
    install_metrics_server
    apply_numbered "$E2E_DIR/fixtures/live"
    ;;
  static)
    create_cluster
    install_karpenter_crds
    install_provider_crds
    install_kwok_plain
    apply_numbered "$E2E_DIR/fixtures/static"
    link_owners
    wait_static
    ;;
esac

log "lab $PROFILE ready: KUBECONFIG=$KUBECONFIG"
