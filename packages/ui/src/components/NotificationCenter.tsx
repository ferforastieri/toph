"use client";

import { type ReactNode, useState } from "react";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";
import { Chip } from "./Chip";
import { Segmented } from "./Segmented";

export interface ActivityItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** "09:12", "ontem". */
  time: ReactNode;
  unread?: boolean;
  /** A face or a card mark before the words. */
  face?: ReactNode;
}

export interface ActivityGroup {
  key: string;
  title: string;
  items: ActivityItem[];
}

/**
 * An activity inbox: groups ("Hoje", "Antes"), a switch between everything and
 * unread only, and a row per event. Opening a row marks it read; the count of
 * unread is on the switch, so the same fact is never only a colored dot.
 */
export function NotificationCenter({
  groups,
  label = "Notificações",
  empty = "Tudo em dia.",
  readAllLabel = "Marcar todas como lidas",
  onReadAll,
  className,
}: {
  groups: ActivityGroup[];
  label?: string;
  empty?: ReactNode;
  readAllLabel?: string;
  onReadAll?: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [read, setRead] = useState<Set<string>>(() => {
    const known = new Set<string>();
    for (const group of groups) for (const item of group.items) if (!item.unread) known.add(item.id);
    return known;
  });

  const unreadCount = groups.reduce(
    (sum, group) => sum + group.items.filter((item) => !read.has(item.id)).length,
    0,
  );

  function open(item: ActivityItem) {
    setRead((current) => new Set(current).add(item.id));
  }

  return (
    <section className={cx("ac-notifs", className)} aria-label={label}>
      <header className="ac-notifs__head">
        <h2 className="ac-notifs__title">{label}</h2>
        <button
          type="button"
          className="ac-link ac-link--action"
          onClick={() => {
            const all = new Set<string>();
            for (const group of groups) for (const item of group.items) all.add(item.id);
            setRead(all);
            onReadAll?.();
          }}
        >
          {readAllLabel}
        </button>
      </header>

      <div className="ac-notifs__filter">
        <Segmented
          value={tab}
          onValueChange={setTab}
          label="Filtro de notificações"
          size="sm"
          options={[
            { value: "all", label: "Todas" },
            { value: "unread", label: "Não lidas", count: unreadCount },
          ]}
        />
      </div>

      <div className="ac-notifs__groups">
        {groups.map((group) => {
          const items = group.items.filter((item) => tab === "all" || !read.has(item.id));
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="ac-notifs__group">
              <p className="ac-notifs__group-title">{group.title}</p>
              <ul>
                {items.map((item) => {
                  const isRead = read.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="ac-notifs__row"
                        data-unread={!isRead || undefined}
                        onClick={() => open(item)}
                      >
                        <span className="ac-notifs__face">{item.face ?? <Icon name="bell" size={16} />}</span>
                        <span className="ac-notifs__text">
                          <span className="ac-notifs__line">
                            <span className="ac-notifs__row-title">{item.title}</span>
                            {!isRead ? <Chip tone="waiting">Nova</Chip> : null}
                          </span>
                          {item.description ? <span className="ac-notifs__desc">{item.description}</span> : null}
                        </span>
                        <span className="ac-notifs__time">{item.time}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {tab === "unread" && unreadCount === 0 ? <p className="ac-notifs__empty">{empty}</p> : null}
      </div>
    </section>
  );
}
