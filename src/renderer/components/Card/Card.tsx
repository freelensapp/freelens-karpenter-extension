import style from "./card.module.scss";
import styleInline from "./card.module.scss?inline";

export function Card({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <>
      <style>{styleInline}</style>
      <div className={className ? style.card + " " + className : style.card}>{children}</div>
    </>
  );
}
