"use client";

import { type ReactNode, useState } from "react";
import { Dialog, DialogBody, DialogFooter } from "./Dialog";

export interface SettingsDialogRow {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  /** The switch, select or button that changes it. */
  control: ReactNode;
}

export interface SettingsDialogSection {
  key: string;
  title: string;
  rows: SettingsDialogRow[];
}

/**
 * Settings in a dialog: a column of sections on the left, the chosen section's
 * rows on the right (a title, a sentence and one control). The dialog keeps
 * the focus trap and Esc; this block only decides what shows.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  sections,
  title = "Ajustes",
  closeLabel = "Fechar",
  initial,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: SettingsDialogSection[];
  title?: string;
  closeLabel?: string;
  /** Section chosen when it opens (the first by default). */
  initial?: string;
  footer?: ReactNode;
}) {
  const [active, setActive] = useState(initial ?? sections[0]?.key);
  const section = sections.find((item) => item.key === active) ?? sections[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} closeLabel={closeLabel} width={720}>
      <DialogBody>
        <div className="ac-settings">
          <nav className="ac-settings__nav" aria-label="Seções de ajustes">
            {sections.map((item) => (
              <button
                key={item.key}
                type="button"
                className="ac-settings__tab"
                data-chosen={item.key === section?.key || undefined}
                aria-current={item.key === section?.key ? "page" : undefined}
                onClick={() => setActive(item.key)}
              >
                {item.title}
              </button>
            ))}
          </nav>

          <div className="ac-settings__pane">
            {section?.rows.map((row) => (
              <div key={row.key} className="ac-settings__row">
                <div className="ac-settings__text">
                  <p className="ac-settings__row-title">{row.title}</p>
                  {row.description ? <p className="ac-settings__row-desc">{row.description}</p> : null}
                </div>
                <div className="ac-settings__control">{row.control}</div>
              </div>
            ))}
          </div>
        </div>
      </DialogBody>

      {footer ? <DialogFooter bar>{footer}</DialogFooter> : null}
    </Dialog>
  );
}
