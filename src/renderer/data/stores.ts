import { Renderer } from "@freelensapp/extensions";
import { AKSNodeClass as AKSNodeClassV1alpha2 } from "../api/aksnodeclass/aksnodeclass-v1alpha2";
import { AKSNodeClass as AKSNodeClassV1beta1 } from "../api/aksnodeclass/aksnodeclass-v1beta1";
import { EC2NodeClass } from "../api/ec2nodeclass/ec2nodeclass-v1";
import { NodeClaim } from "../api/nodeclaim/nodeclaim-v1";
import { NodePool } from "../api/nodepool/nodepool-v1";

// Where the dashboard's data comes from. A model's store exists only while the cluster serves its API: the host
// registers the APIs of the CRDs after the cluster frame has loaded them, and its registry is observable, so a
// component that calls these functions while it renders is an `observer` and follows the CRDs as they come and go.

/**
 * The first store whose API the cluster serves, trying the classes of a kind newest API version first, or
 * `undefined` when it serves none. A model's `getStore()` throws when its API is not registered. Only one version
 * of a kind is used, so no object is counted twice.
 */
export function getServedStore<S>(...getStores: (() => S)[]): S | undefined {
  for (const getStore of getStores) {
    try {
      return getStore();
    } catch {
      // not served, try the next version
    }
  }
  return undefined;
}

export type AKSNodeClass = AKSNodeClassV1beta1 | AKSNodeClassV1alpha2;

export const getNodePoolStore = () => getServedStore(() => NodePool.getStore<NodePool>());
export const getNodeClaimStore = () => getServedStore(() => NodeClaim.getStore<NodeClaim>());
export const getEC2NodeClassStore = () => getServedStore(() => EC2NodeClass.getStore<EC2NodeClass>());
export const getAKSNodeClassStore = () =>
  getServedStore<
    Renderer.K8sApi.KubeObjectStore<AKSNodeClassV1beta1> | Renderer.K8sApi.KubeObjectStore<AKSNodeClassV1alpha2>
  >(
    () => AKSNodeClassV1beta1.getStore<AKSNodeClassV1beta1>(),
    () => AKSNodeClassV1alpha2.getStore<AKSNodeClassV1alpha2>(),
  );

/** The host's stores of the built-in kinds the dashboard reads. */
export const getNodeStore = () => Renderer.K8sApi.nodesStore;
export const getPodStore = () => Renderer.K8sApi.podsStore;

/**
 * The namespaces whose events the dashboard reads. Karpenter writes the events of its cluster-scoped objects
 * (NodePools, NodeClaims, nodes) to `default`; the other two are where it is commonly installed.
 */
export const karpenterEventNamespaces = ["default", "karpenter", "karpenter-system"];

type KubeEvent = Renderer.K8sApi.KubeEvent;

type KubeEventApi = Renderer.K8sApi.KubeApi<KubeEvent, Renderer.K8sApi.KubeEventData>;

export class KarpenterEventStore extends Renderer.K8sApi.KubeObjectStore<KubeEvent, KubeEventApi> {}

let karpenterEventStore: KarpenterEventStore | undefined;

/**
 * A store of the extension for the events of the namespaces above: loading it leaves the host's own event store,
 * and what its Events page has loaded, as they are. One per cluster frame, as the module is.
 *
 * Its API is a `KubeApi` of its own, not `Renderer.K8sApi.eventApi`: through that object every function member
 * is wrapped in a plain function, `objectConstructor` included, so the store's `new api.objectConstructor()` for
 * each watch event throws "Class constructor KubeEvent cannot be invoked without 'new'". `autoRegister: false`
 * keeps it out of the host's API registry, where it would take the place of the host's event API.
 */
export function getKarpenterEventStore(): KarpenterEventStore {
  karpenterEventStore ??= new KarpenterEventStore(
    new Renderer.K8sApi.KubeApi<KubeEvent, Renderer.K8sApi.KubeEventData>({
      objectConstructor: Renderer.K8sApi.KubeEvent,
      autoRegister: false,
    }),
  );
  return karpenterEventStore;
}
