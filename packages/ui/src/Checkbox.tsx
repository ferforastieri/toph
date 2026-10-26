import { Check } from "@toph/icons";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled = false }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={`ui-checkbox ${checked ? "checked" : ""}`.trim()}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-checkbox-box">{checked && <Check size={12} strokeWidth={3} />}</span>
      {label && <span>{label}</span>}
    </button>
  );
}
