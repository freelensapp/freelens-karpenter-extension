import { Renderer } from "@freelensapp/extensions";
import { detailUrl } from "../../utils/kube-helpers";

import type React from "react";

export interface DetailsLinkProps {
  /** The `selfLink` of the object, or an empty one for the text alone. */
  selfLink: string;
  /**
   * The URL of the list page to open the details on, such as `pageUrl(pageId.nodePools)`, for a link in a table of
   * one kind to an object of another kind that has a page; without one, the details open over the page that is open.
   */
  page?: string;
  title?: string;
  children?: React.ReactNode;
}

/**
 * A link that opens the details of another object in the details drawer, over the page that is open, as the host's
 * own links in its drawers and tables do, or on the list page of its kind. It prevents the click's default and stops
 * it there: in a table row, the row would otherwise open its own object's details in its place.
 */
export function DetailsLink({ selfLink, page, title, children }: DetailsLinkProps) {
  if (!selfLink) return <>{children}</>;

  return (
    <a
      title={title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (page) Renderer.Navigation.navigate(detailUrl(page, selfLink));
        else Renderer.Navigation.showDetails(selfLink);
      }}
    >
      {children}
    </a>
  );
}
