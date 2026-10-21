"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface FancyOption {
  value: string;
  label: string;
  badge?: string;
}

export interface FancyGroup {
  label: string;
  options: FancyOption[];
}

export function FancySelect({ value, onChange, groups, options, icon, ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  groups?: FancyGroup[];
  options?: FancyOption[];
  icon?: React.ReactNode;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const flat = groups ? groups.flatMap((g) => g.options) : (options ?? []);
  const selected = flat.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function renderOption(option: FancyOption) {
    const active = option.value === value;
    return <li key={option.value} role="option" aria-selected={active}>
      <button type="button" className={active ? "active" : ""}
        onClick={() => { onChange(option.value); setOpen(false); }}>
        <span className="fancy-option-label">{option.label}</span>
        {option.badge && <span className="fancy-option-badge">{option.badge}</span>}
        {active && <Check size={13} />}
      </button>
    </li>;
  }

  return <div className={`fancy-select${open ? " open" : ""}`} ref={rootRef}>
    <button type="button" className="fancy-trigger" aria-haspopup="listbox"
      aria-expanded={open} aria-label={ariaLabel}
      onClick={() => setOpen((v) => !v)}>
      {icon}
      <span className="fancy-value">{selected?.label ?? "Selecione"}</span>
      {selected?.badge && <span className="fancy-value-badge">{selected.badge}</span>}
      <ChevronDown size={13} className="fancy-chevron" />
    </button>
    {open && <div className="fancy-panel" role="listbox" aria-label={ariaLabel}>
      {groups
        ? groups.map((group) => <div key={group.label} className="fancy-group">
            <span className="fancy-group-label">{group.label}</span>
            <ul>{group.options.map(renderOption)}</ul>
          </div>)
        : <ul>{flat.map(renderOption)}</ul>}
    </div>}
  </div>;
}
