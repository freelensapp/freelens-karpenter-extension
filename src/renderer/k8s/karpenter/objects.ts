import { nodePoolApi } from "./store";

export const karpenterObjects = [
    {
    kind: "KarpenterNodePool",
    apiVersions: [
      "provisioning.karpenter.sh/v1beta1",
      "provisioning.karpenter.sh/v1beta2",
      "provisioning.karpenter.sh/v1",
    ],
    api: nodePoolApi,
  },
]