"use client";

import { cx } from "../cx";
import { Button } from "./Button";

/** The pages to show: the ends, the current one and its neighbours, gaps elsewhere. */
function pageItems(page: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);

  const wanted = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => wanted.add(n));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((n) => wanted.add(n));

  const pages = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  pages.forEach((n, index) => {
    if (index > 0 && n - pages[index - 1] > 1) items.push("gap");
    items.push(n);
  });
  return items;
}

/**
 * Page numbers for a long list: the ends and the current page always show,
 * the middle folds into an ellipsis. The current page is a pressed button
 * (`aria-current`), the arrows disable at the ends.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = "Paginação",
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
  className?: string;
}) {
  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), total);

  return (
    <nav aria-label={label} className={cx("ac-pager", className)}>
      <Button
        variant="ghost"
        size="sm"
        icon="chevronLeft"
        iconOnly
        aria-label="Página anterior"
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
      />

      <ol className="ac-pager__list">
        {pageItems(current, total).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} className="ac-pager__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <Button
                variant={item === current ? "default" : "ghost"}
                size="sm"
                aria-label={`Página ${item}`}
                aria-current={item === current ? "page" : undefined}
                className="ac-pager__num"
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            </li>
          ),
        )}
      </ol>

      <Button
        variant="ghost"
        size="sm"
        icon="chevronRight"
        iconOnly
        aria-label="Próxima página"
        disabled={current >= total}
        onClick={() => onPageChange(current + 1)}
      />
    </nav>
  );
}
