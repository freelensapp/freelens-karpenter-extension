import { Renderer } from "@freelensapp/extensions";

import type React from "react";

export interface DetailsLinkProps {
  /** The `selfLink` of the object, or an empty one for the text alone. */
  selfLink: string;
  title?: string;
  children?: React.ReactNode;
}

/**
 * A link that opens the details of another object in the details drawer, over the page that is open, as the host's
 * own links in its drawers and tables do. It prevents the click's default and stops it there: in a table row, the
 * row would otherwise open its own object's details in its place.
 */
export function DetailsLink({ selfLink, title, children }: DetailsLinkProps) {
  if (!selfLink) return <>{children}</>;

  return (
    <a
      title={title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        Renderer.Navigation.showDetails(selfLink);
      }}
    >
      {children}
    </a>
  );
}
