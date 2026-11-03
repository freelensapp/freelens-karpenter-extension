import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { conditionFlag } from "../../utils/printer-columns";
import { resourceQuantity } from "../../utils/quantity";
import styles from "./kind-list-page.module.scss";

import type React from "react";

const {
  Component: { Badge, BadgeBoolean, KubeObjectAge, KubeObjectListLayout, WithTooltip, getBooleanClass, getBooleanText },
} = Renderer;

type KubeObject = Renderer.K8sApi.KubeObject;

/**
 * A column of a list page: a column of `kubectl get -o wide`, under the same name. The id keys its sorting and its
 * visibility, which the host's table lets the user change and remembers.
 */
export interface KindColumn<K extends KubeObject> {
  id: string;
  title: string;
  /** The cell; its value comes from a pure function of the object, not from an expression here. */
  render: (object: K) => React.ReactElement | string | null;
  /** What the column sorts by; without one, the column does not sort. */
  sortBy?: (object: K) => string | number | undefined;
  className?: string;
}

/** The Name column, first in every list. */
export function nameColumn<K extends KubeObject>(): KindColumn<K> {
  return {
    id: "name",
    title: "Name",
    render: (object) => <WithTooltip>{object.getName()}</WithTooltip>,
    sortBy: (object) => object.getName(),
    className: styles.name,
  };
}

/** The Age column, from the creation timestamp, as `kubectl` shows it. */
export function ageColumn<K extends KubeObject>(): KindColumn<K> {
  return {
    id: "age",
    title: "Age",
    render: (object) => <KubeObjectAge key="age" object={object} />,
    // The oldest is the largest age: the timestamp backwards, as the host's own lists sort it.
    sortBy: (object) => -object.getCreationTimestamp(),
    className: styles.age,
  };
}

/** A column whose cell is a text, shown as it is, with a tooltip when it does not fit. */
export function textColumn<K extends KubeObject>(
  id: string,
  title: string,
  value: (object: K) => string | undefined,
  sortBy: (object: K) => string | number | undefined = value,
  className?: string,
): KindColumn<K> {
  return { id, title, render: (object) => <WithTooltip>{value(object) ?? ""}</WithTooltip>, sortBy, className };
}

/**
 * A narrow column whose cell is a quantity of a resource, as the host's Node details show it: memory and ephemeral
 * storage in units, with the quantity as it was written in its tooltip (`resourceQuantity`).
 */
export function quantityColumn<K extends KubeObject>(
  id: string,
  title: string,
  resource: string,
  value: (object: K) => string | undefined,
  sortBy: (object: K) => string | number | undefined,
): KindColumn<K> {
  return {
    id,
    title,
    render: (object) => {
      const written = value(object);
      const shown = resourceQuantity(resource, written);
      return <WithTooltip tooltip={shown !== written ? written : undefined}>{shown ?? ""}</WithTooltip>;
    },
    sortBy,
    className: styles.quantity,
  };
}

/** A narrow column whose cell is a short number, such as a count or a quantity. */
export function numberColumn<K extends KubeObject>(
  id: string,
  title: string,
  value: (object: K) => string | undefined,
  sortBy: (object: K) => string | number | undefined,
): KindColumn<K> {
  return textColumn(id, title, value, sortBy, styles.number);
}

/**
 * A column whose cell is a list of texts, such as `key=value` pairs, each a badge, as the host's `DrawerItemLabels`
 * shows labels, in a column narrower or wider than a text, for a few short texts or several long ones. It sorts by the
 * texts joined.
 */
export function badgesColumn<K extends KubeObject>(
  id: string,
  title: string,
  texts: (object: K) => string[],
  width: "narrow" | "wide",
  sortBy: (object: K) => string | number | undefined = (object) => texts(object).join(" "),
): KindColumn<K> {
  return {
    id,
    title,
    className: width === "narrow" ? styles.narrowBadges : styles.wideBadges,
    // A text can repeat, as the same channel in two terms: the key is its place.
    render: (object) => (
      <>
        {texts(object).map((text, index) => (
          <Badge key={index} label={text} title={text} />
        ))}
      </>
    ),
    sortBy,
  };
}

/**
 * A narrow column whose cell is a list of short texts, such as names of ranges: one text as a text, several each a
 * badge, as `badgesColumn` shows them. It sorts by the texts joined; one without a text sorts first.
 */
export function shortTextsColumn<K extends KubeObject>(
  id: string,
  title: string,
  texts: (object: K) => string[],
): KindColumn<K> {
  const badges = badgesColumn(id, title, texts, "narrow");
  return {
    ...badges,
    className: styles.short,
    render: (object) => {
      const values = texts(object);
      return values.length > 1 ? badges.render(object) : <WithTooltip>{values[0] ?? ""}</WithTooltip>;
    },
  };
}

/**
 * The Ready column of every page that has one: the status of the Ready condition as the host's badge of a boolean,
 * `-` for `Unknown` and none (`conditionFlag`), in a column narrower than another flag.
 */
export function readyColumn<K extends KubeObject>(
  status: (object: K) => string | undefined,
  sortBy: (object: K) => string | number | undefined,
): KindColumn<K> {
  return {
    ...booleanColumn("ready", "Ready", (object) => conditionFlag(status(object)), sortBy),
    className: styles.ready,
  };
}

/**
 * A narrow column whose cell is a flag, as the host's badge of a boolean: `True`, `False`, or `-` for `undefined`.
 */
export function booleanColumn<K extends KubeObject>(
  id: string,
  title: string,
  value: (object: K) => boolean | undefined,
  sortBy: (object: K) => string | number | undefined = (object) => (value(object) ? 0 : 1),
): KindColumn<K> {
  return { id, title, render: (object) => <BadgeBoolean value={value(object)} />, sortBy, className: styles.flag };
}

/**
 * A `booleanColumn` of a flag that is a problem when set, such as Drifted: the host's badge of a boolean with its
 * colours swapped, `True` in the colour of an error and `False` in that of a success. `-` keeps its colour.
 */
export function problemFlagColumn<K extends KubeObject>(
  id: string,
  title: string,
  value: (object: K) => boolean | undefined,
  sortBy?: (object: K) => string | number | undefined,
): KindColumn<K> {
  return {
    ...booleanColumn(id, title, value, sortBy),
    render: (object) => {
      const flag = value(object);
      return <Badge className={getBooleanClass(flag === undefined ? undefined : !flag)} label={getBooleanText(flag)} />;
    },
  };
}

export interface KindListPageProps<K extends KubeObject> {
  /** The title of the page, `crd.title` of the model. */
  title: string;
  /** The plural of the resource, `crd.plural` of the model, for the table's id. */
  plural: string;
  /** The store of the version the cluster serves, or `undefined` when it serves none. */
  store: Renderer.K8sApi.KubeObjectStore<K> | undefined;
  columns: KindColumn<K>[];
}

/**
 * The list page of a kind: the host's `KubeObjectListLayout` over the store the cluster serves, searchable, sortable
 * by every column that has a value to sort by, and with the columns the user chooses. A click on a row opens the
 * object's details in the host's drawer, over the page.
 *
 * The caller is an `observer` that reads the store while it renders (`getServedStore` of `data/stores.ts`), so the
 * page follows the CRD as it comes and goes; without a store it says that the cluster does not serve the kind.
 */
export const KindListPage = observer(function KindListPage<K extends KubeObject>({
  title,
  plural,
  store,
  columns,
}: KindListPageProps<K>) {
  if (!store) {
    return (
      <div className={styles.notServed}>
        <h3>{title}</h3>
        <p>The cluster does not serve this resource.</p>
      </div>
    );
  }

  const sortingCallbacks = Object.fromEntries(
    columns.flatMap((column) => (column.sortBy ? [[column.id, column.sortBy]] : [])),
  ) as Record<string, (object: K) => string | number | undefined>;

  return (
    <KubeObjectListLayout<K, Renderer.K8sApi.KubeApi<K>>
      tableId={`karpenter-${plural}`}
      className={styles.page}
      store={store}
      isConfigurable
      sortingCallbacks={sortingCallbacks}
      searchFilters={[(object: K) => object.getSearchFields()]}
      renderHeaderTitle={title}
      renderTableHeader={columns.map((column) => ({
        id: column.id,
        title: column.title,
        className: column.className,
        sortBy: column.sortBy ? column.id : undefined,
      }))}
      renderTableContents={(object: K) => columns.map((column) => column.render(object))}
    />
  );
}) as <K extends KubeObject>(props: KindListPageProps<K>) => React.ReactElement;
