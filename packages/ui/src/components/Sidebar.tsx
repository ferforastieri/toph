"use client";

import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../icons/Icon";

export interface NavItem {
  key: string;
  label: ReactNode;
  icon?: IconName;
  href?: string;
  chosen?: boolean;
  /** A count chip at the end ("Threads 4"). */
  count?: ReactNode;
  /** A face before the label (an agent, a person). */
  face?: ReactNode;
}

export interface NavSection {
  key: string;
  title?: string;
  items: NavItem[];
}

/**
 * The left rail of an app: a brand, the workspace, sections of links with
 * icons and counts, and the person at the bottom. It is only the navigation;
 * the screen beside it is the caller's.
 */
export function Sidebar({
  brand,
  workspace,
  sections,
  footer,
  label = "Navegação",
  className,
}: {
  brand?: ReactNode;
  workspace?: ReactNode;
  sections: NavSection[];
  footer?: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <aside className={cx("ac-nav", className)}>
      {brand ? <div className="ac-nav__brand">{brand}</div> : null}
      {workspace ? <div className="ac-nav__workspace">{workspace}</div> : null}

      <nav aria-label={label} className="ac-nav__sections">
        {sections.map((section) => (
          <div key={section.key} className="ac-nav__section">
            {section.title ? <p className="ac-nav__title">{section.title}</p> : null}
            <ul>
              {section.items.map((item) => {
                const body = (
                  <>
                    {item.face ?? (item.icon ? <Icon name={item.icon} size={16} /> : null)}
                    <span className="ac-nav__label">{item.label}</span>
                    {item.count !== undefined ? <span className="ac-nav__count">{item.count}</span> : null}
                  </>
                );
                return (
                  <li key={item.key}>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="ac-nav__item"
                        data-chosen={item.chosen || undefined}
                        aria-current={item.chosen ? "page" : undefined}
                      >
                        {body}
                      </a>
                    ) : (
                      <button type="button" className="ac-nav__item" data-chosen={item.chosen || undefined}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer ? <div className="ac-nav__foot">{footer}</div> : null}
    </aside>
  );
}
