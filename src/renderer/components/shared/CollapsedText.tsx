import { Renderer } from "@freelensapp/extensions";
import styles from "./collapsed-text.module.scss";

const {
  Component: { DrawerItem },
} = Renderer;

/**
 * A long text of a drawer item, such as a script, collapsed under its summary until the user opens it, then as it is,
 * in a monospace font; nothing without a text.
 */
export function CollapsedText({ name, text, summary }: { name: string; text: string | undefined; summary: string }) {
  return (
    <DrawerItem name={name} hidden={!text}>
      <details className={styles.collapsed}>
        <summary>{summary}</summary>
        <pre className={styles.text}>{text}</pre>
      </details>
    </DrawerItem>
  );
}
