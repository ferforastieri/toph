"use client";

import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";

export interface Crumb {
  label: ReactNode;
  href?: string;
}

/**
 * The path to the current screen: links for what came before, plain words for
 * where you are (the last one, `aria-current`). A long trail scrolls sideways
 * instead of wrapping the header.
 */
export function Breadcrumb({
  items,
  label = "Trilha de navegação",
  className,
}: {
  items: Crumb[];
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cx("ac-crumbs", className)}>
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index}>
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined}>{item.label}</span>
              ) : (
                <a href={item.href}>{item.label}</a>
              )}
              {!last && <Icon name="chevronRight" size={14} className="ac-crumbs__sep" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
