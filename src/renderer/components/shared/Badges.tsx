import { Renderer } from "@freelensapp/extensions";

const {
  Component: { Badge, DrawerItem },
} = Renderer;

/** Texts as badges of a drawer item, one per line; nothing without any. */
export function Badges({ name, texts }: { name: string; texts: string[] }) {
  return (
    <DrawerItem name={name} labelsOnly hidden={texts.length === 0}>
      {texts.map((text) => (
        <Badge key={text} label={text} />
      ))}
    </DrawerItem>
  );
}
