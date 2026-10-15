#!/usr/bin/env python3
"""Generate the node, NodeClaim, NodePool status and pod fixtures of the static lab.

The shapes follow what Karpenter v1.15.0 writes on a real cluster (observed on the live lab):
labels on nodes and NodeClaims, NodeClaim conditions and status, NodePool status. The node
ownerReferences to their NodeClaims need the NodeClaims' uids, so lab-up.sh sets them after the apply.

Run from this directory: ./gen-fixtures.py. It rewrites 21-, 30-, 31-, 40-, 41- and 50-*.yaml.
"""

import hashlib
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
TS = "2026-10-01T08:00:00Z"

# name, pool, nodeclass kind, instance type, capacity type, zone, cpu, memory Ki, pods, state
NODES = [
    ("ip-10-0-1-11.eu-west-1.compute.internal", "general", "aws", "m5.xlarge", "spot", "eu-west-1a", 4, 15_896_604, 58, "ready", "general-7xk2p"),
    ("ip-10-0-2-12.eu-west-1.compute.internal", "general", "aws", "m5.2xlarge", "on-demand", "eu-west-1b", 8, 32_118_888, 58, "ready", "general-9qwmt"),
    ("ip-10-0-1-13.eu-west-1.compute.internal", "general", "aws", "c6i.large", "spot", "eu-west-1a", 2, 3_885_916, 29, "disrupting", "general-b4n8r"),
    ("ip-10-0-1-14.eu-west-1.compute.internal", "general", "aws", "m5.large", "on-demand", "eu-west-1a", 2, 7_786_160, 29, "notready", "general-c2v6l"),
    ("ip-10-0-2-21.eu-west-1.compute.internal", "gpu", "aws", "g5.xlarge", "on-demand", "eu-west-1b", 4, 16_202_400, 58, "ready", "gpu-h5j3d"),
    ("aks-azure-a1b2c-12345678-vmss000000", "azure", "azure", "Standard_D4s_v5", "on-demand", "westeurope-1", 4, 16_393_220, 50, "ready", "azure-a1b2c"),
    ("aks-azure-d3e4f-12345678-vmss000001", "azure", "azure", "Standard_D8s_v5", "spot", "westeurope-2", 8, 32_890_980, 50, "ready", "azure-d3e4f"),
]
CLAIMING = ("general-pend1", "general", "aws")

POD_PLACEMENT = {
    "ip-10-0-1-11.eu-west-1.compute.internal": ["web-1", "web-2", "web-3"],
    "ip-10-0-2-12.eu-west-1.compute.internal": ["web-4", "api-1", "api-2", "worker-1"],
    "ip-10-0-1-13.eu-west-1.compute.internal": ["web-5"],
    "ip-10-0-2-21.eu-west-1.compute.internal": ["train-1"],
    "aks-azure-a1b2c-12345678-vmss000000": ["api-3", "api-4"],
    "aks-azure-d3e4f-12345678-vmss000001": ["batch-1", "batch-2", "batch-3"],
}


def yaml(value, indent=0):
    """A small YAML emitter for maps, lists and scalars, enough for these fixtures."""
    pad = "  " * indent
    if isinstance(value, dict):
        lines = []
        for k, v in value.items():
            if isinstance(v, (dict, list)) and v:
                lines.append(f"{pad}{k}:")
                lines.append(yaml(v, indent + 1))
            else:
                lines.append(f"{pad}{k}: {scalar(v)}")
        return "\n".join(lines)
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, dict):
                body = yaml(item, indent + 1).split("\n")
                lines.append(f"{pad}- {body[0].strip()}")
                lines.extend(body[1:])
            else:
                lines.append(f"{pad}- {scalar(item)}")
        return "\n".join(lines)
    return f"{pad}{scalar(value)}"


# A plain YAML scalar: no indicator first, no ": " or " #" inside, no space or ":" at the end.
PLAIN = re.compile(r"""^(?![-?:,\[\]{}#&*!|>'"%@`\s])(?!.*(: | #))(?!.*[\s:]$).+$""")
# What YAML reads as another type than a string: booleans and null, numbers, dates and times.
NOT_STRINGS = re.compile(
    r"^(true|false|yes|no|on|off|null|y|n|~"
    r"|[-+]?(\d[\d_]*)?\.?\d+([eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o?[0-7]+"
    r"|\d{4}-\d{2}-\d{2}([Tt ].*)?)$",
    re.IGNORECASE,
)


def scalar(v):
    """A YAML scalar, quoted only where YAML would otherwise read it as another type (yamllint quoted-strings)."""
    if v == {} or v == []:
        return "{}" if v == {} else "[]"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if PLAIN.match(v) and not NOT_STRINGS.match(v):
        return v
    return json.dumps(v)


def docs(objs):
    return "\n---\n".join(yaml(o) for o in objs) + "\n"


def provider_labels(kind, itype, cpu, mem_ki):
    if kind == "aws":
        family, size = itype.split(".")
        return {
            "karpenter.k8s.aws/ec2nodeclass": "default" if family != "g5" else "gpu",
            "karpenter.k8s.aws/instance-category": family[0],
            "karpenter.k8s.aws/instance-family": family,
            "karpenter.k8s.aws/instance-size": size,
            "karpenter.k8s.aws/instance-cpu": str(cpu),
            "karpenter.k8s.aws/instance-memory": str(mem_ki // 1024),
            "topology.kubernetes.io/region": "eu-west-1",
        }
    return {
        "karpenter.azure.com/aksnodeclass": "default",
        "karpenter.azure.com/sku-name": itype,
        "karpenter.azure.com/sku-family": "D",
        "karpenter.azure.com/sku-cpu": str(cpu),
        "karpenter.azure.com/sku-memory": str(mem_ki // 1024),
        "topology.kubernetes.io/region": "westeurope",
    }


def resources(cpu, mem_ki, pods):
    return {"cpu": str(cpu), "memory": f"{mem_ki}Ki", "pods": str(pods), "ephemeral-storage": "20Gi"}


def allocatable(cpu, mem_ki, pods):
    return {"cpu": f"{cpu * 1000 - 80}m", "memory": f"{int(mem_ki * 0.9)}Ki", "pods": str(pods), "ephemeral-storage": "18Gi"}


def provider_id(kind, zone, claim):
    if kind == "aws":
        return f"aws:///{zone}/i-0{hashlib.sha256(claim.encode()).hexdigest()[:16]}"
    return f"azure:///subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mc_lab/providers/Microsoft.Compute/virtualMachines/{claim}"


def condition(type_, status, reason=None, message=""):
    return {"type": type_, "status": status, "reason": reason or type_, "message": message, "lastTransitionTime": TS}


def nodeclass_ref(kind, pool):
    if kind == "aws":
        return {"group": "karpenter.k8s.aws", "kind": "EC2NodeClass", "name": "gpu" if pool == "gpu" else "default"}
    return {"group": "karpenter.azure.com", "kind": "AKSNodeClass", "name": "default"}


nodes, node_status, claims, claim_status = [], [], [], []
pool_totals = {}
for name, pool, kind, itype, ctype, zone, cpu, mem, pods, state, claim in NODES:
    labels = {
        "karpenter.sh/nodepool": pool,
        "karpenter.sh/capacity-type": ctype,
        "karpenter.sh/registered": "true",
        "node.kubernetes.io/instance-type": itype,
        "topology.kubernetes.io/zone": zone,
        "kubernetes.io/arch": "amd64",
        "kubernetes.io/os": "linux",
        "kubernetes.io/hostname": name.split(".")[0],
        **provider_labels(kind, itype, cpu, mem),
    }
    if state != "notready":
        labels["karpenter.sh/initialized"] = "true"
    annotations = {"karpenter.sh/nodepool-hash-version": "v3"}
    if state != "notready":
        # Managed by the KWOK controller, which keeps the node Ready; the not-ready node has no kubelet at all.
        annotations["kwok.x-k8s.io/node"] = "fake"
    taints = []
    if pool == "gpu":
        taints.append({"key": "nvidia.com/gpu", "effect": "NoSchedule"})
    if state == "disrupting":
        taints.append({"key": "karpenter.sh/disruption", "value": "disrupting", "effect": "NoSchedule"})
    if state == "notready":
        taints.append({"key": "karpenter.sh/unregistered", "effect": "NoExecute"})
    spec = {"providerID": provider_id(kind, zone, claim)}
    if taints:
        spec["taints"] = taints
    nodes.append({"apiVersion": "v1", "kind": "Node", "metadata": {"name": name, "labels": labels, "annotations": annotations}, "spec": spec})
    node_status.append({
        "apiVersion": "v1", "kind": "Node", "metadata": {"name": name},
        "status": {"capacity": resources(cpu, mem, pods), "allocatable": allocatable(cpu, mem, pods)},
    })

    claim_labels = {k: v for k, v in labels.items() if k not in ("karpenter.sh/registered", "karpenter.sh/initialized")}
    claims.append({
        "apiVersion": "karpenter.sh/v1", "kind": "NodeClaim",
        "metadata": {"name": claim, "labels": claim_labels, "annotations": {"karpenter.sh/nodepool-hash-version": "v3"}},
        "spec": {
            "nodeClassRef": nodeclass_ref(kind, pool),
            "requirements": [
                {"key": "karpenter.sh/nodepool", "operator": "In", "values": [pool]},
                {"key": "node.kubernetes.io/instance-type", "operator": "In", "values": [itype]},
            ],
            "expireAfter": "720h",
        },
    })
    ready = state not in ("notready",)
    claim_status.append({
        "apiVersion": "karpenter.sh/v1", "kind": "NodeClaim", "metadata": {"name": claim},
        "status": {
            "nodeName": name,
            "providerID": provider_id(kind, zone, claim),
            "imageID": "ami-0a1b2c3d4e5f60001" if kind == "aws" else "AKSAzureLinux-V3gen2-202610.01.0",
            "capacity": resources(cpu, mem, pods),
            "allocatable": allocatable(cpu, mem, pods),
            "conditions": [
                condition("Launched", "True"),
                condition("Registered", "True"),
                condition("Initialized", "True" if ready else "Unknown", None if ready else "NotInitialized", "" if ready else "Node not ready"),
                condition("Ready", "True" if ready else "Unknown", None if ready else "NotInitialized"),
                *([condition("Disrupting", "True", "Underutilized")] if state == "disrupting" else []),
            ],
        },
    })
    t = pool_totals.setdefault(pool, {"nodes": 0, "cpu": 0, "mem": 0, "pods": 0})
    t["nodes"] += 1
    t["cpu"] += cpu
    t["mem"] += mem
    t["pods"] += pods

cname, cpool, ckind = CLAIMING
claims.append({
    "apiVersion": "karpenter.sh/v1", "kind": "NodeClaim",
    "metadata": {"name": cname, "labels": {"karpenter.sh/nodepool": cpool, "karpenter.sh/capacity-type": "on-demand"}},
    "spec": {
        "nodeClassRef": nodeclass_ref(ckind, cpool),
        "requirements": [{"key": "karpenter.sh/nodepool", "operator": "In", "values": [cpool]}],
        "expireAfter": "720h",
    },
})
claim_status.append({
    "apiVersion": "karpenter.sh/v1", "kind": "NodeClaim", "metadata": {"name": cname},
    "status": {"conditions": [condition("Launched", "Unknown", "NotLaunched", "Waiting for an instance")]},
})

pool_status = []
for pool in ("general", "gpu", "azure", "empty"):
    t = pool_totals.get(pool, {"nodes": 0, "cpu": 0, "mem": 0, "pods": 0})
    pool_status.append({
        "apiVersion": "karpenter.sh/v1", "kind": "NodePool", "metadata": {"name": pool},
        "status": {
            "nodes": t["nodes"],
            "nodeClassObservedGeneration": 1,
            "resources": {"cpu": str(t["cpu"]), "memory": f"{t['mem']}Ki", "pods": str(t["pods"]), "nodes": str(t["nodes"]), "ephemeral-storage": "0"},
            "conditions": [
                condition("ValidationSucceeded", "True"),
                condition("NodeClassReady", "False" if pool == "gpu" else "True", "NodeClassNotReady" if pool == "gpu" else None),
                condition("NodeRegistrationHealthy", "True"),
                condition("Ready", "False" if pool == "gpu" else "True", "NodeClassNotReady" if pool == "gpu" else None),
            ],
        },
    })

pods = []
for node, names in POD_PLACEMENT.items():
    for pod in names:
        app = pod.split("-")[0]
        spec = {
            "nodeName": node,
            "terminationGracePeriodSeconds": 0,
            "containers": [{"name": app, "image": "registry.k8s.io/pause:3.10", "resources": {"requests": {"cpu": "500m", "memory": "512Mi"}}}],
        }
        if app == "train":
            spec["tolerations"] = [{"key": "nvidia.com/gpu", "operator": "Exists", "effect": "NoSchedule"}]
        pods.append({"apiVersion": "v1", "kind": "Pod", "metadata": {"name": pod, "namespace": "team-a", "labels": {"app": app}}, "spec": spec})

header = "# Generated by gen-fixtures.py; edit the generator, not this file.\n"
(HERE / "21-nodepools-status.yaml").write_text(header + docs(pool_status))
(HERE / "30-nodes.yaml").write_text(header + docs(nodes))
(HERE / "31-nodes-status.yaml").write_text(header + docs(node_status))
(HERE / "40-nodeclaims.yaml").write_text(header + docs(claims))
(HERE / "41-nodeclaims-status.yaml").write_text(header + docs(claim_status))
(HERE / "50-pods.yaml").write_text(header + docs(pods))
print("written:", len(nodes), "nodes,", len(claims), "nodeclaims,", len(pods), "pods")
