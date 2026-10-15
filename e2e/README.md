# Local lab

Two kind clusters with Karpenter objects, for developing and testing the
extension without a cloud account. The design, the safety rules and the test
levels are in [SPEC-0002](../docs/specs/SPEC-0002-local-lab.md).

Tools: kind, kubectl, helm, Docker; for the `live` profile also Go and `ko`.

```sh
e2e/scripts/lab-up.sh static        # CRDs and fixtures, no controller
e2e/scripts/lab-up.sh live          # Karpenter v1.15.0 with the KWOK provider
e2e/scripts/lab-scale.sh 20 4       # live: scale the inflate workloads up, or down
e2e/scripts/lab-aks-v1alpha2.sh on  # static: also serve AKSNodeClass v1alpha2
e2e/scripts/lab-down.sh static      # delete the cluster of a profile
```

Each profile has its own kubeconfig, `.e2e/<profile>/kubeconfig`; the scripts
never read or write your own. Point Freelens at that file only.

After changing `e2e/fixtures/static/gen-fixtures.py`, run it to rewrite the
generated fixtures.
