"use client";

import { type ReactNode, useState } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "../icons/Icon";

export interface TreeItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  children?: TreeItem[];
}

/**
 * Folders and pages as a tree: a twist opens a branch, the name selects it,
 * the open state lives here and the choice lives with the caller. Every row is
 * a real button, so the keyboard and a reader reach each one.
 */
export function TreeView({
  items,
  selected,
  onSelect,
  defaultOpen = [],
  label = "Árvore",
  className,
}: {
  items: TreeItem[];
  selected?: string;
  onSelect?: (id: string) => void;
  /** Ids of the branches open on the first render. */
  defaultOpen?: string[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function branch(nodes: TreeItem[], depth: number): ReactNode {
    return (
      <ul role={depth === 0 ? "none" : "group"} className={depth === 0 ? undefined : "ac-tree__branch"}>
        {nodes.map((node) => {
          const hasChildren = Boolean(node.children?.length);
          const isOpen = open.has(node.id);
          return (
            <li
              key={node.id}
              role="treeitem"
              aria-expanded={hasChildren ? isOpen : undefined}
              aria-selected={selected === node.id}
              className="ac-tree__item"
            >
              <div className="ac-tree__row" data-chosen={selected === node.id || undefined}>
                <button
                  type="button"
                  className="ac-tree__twist"
                  tabIndex={hasChildren ? 0 : -1}
                  aria-label={hasChildren ? (isOpen ? "Fechar" : "Abrir") : undefined}
                  aria-hidden={hasChildren ? undefined : true}
                  onClick={() => hasChildren && toggle(node.id)}
                >
                  {hasChildren ? <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={14} /> : null}
                </button>

                <button
                  type="button"
                  className="ac-tree__label"
                  onClick={() => onSelect?.(node.id)}
                  aria-current={selected === node.id ? "true" : undefined}
                >
                  {node.icon ? <Icon name={node.icon} size={16} /> : null}
                  <span>{node.label}</span>
                </button>
              </div>

              {hasChildren && isOpen ? branch(node.children ?? [], depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={cx("ac-treeview", className)} role="tree" aria-label={label}>
      {branch(items, 0)}
    </div>
  );
}
