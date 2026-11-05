"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface FancyOption {
  value: string;
  label: string;
  badge?: string;
}

export interface FancyGroup {
  label: string;
  options: FancyOption[];
}

// Compara sem acento/caixa — achar "Sao Jose" quando a opção é "São José".
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();


export function FancySelect({ value, onChange, groups, options, icon, ariaLabel, searchPlaceholder }: {
  value: string;
  onChange: (value: string) => void;
  groups?: FancyGroup[];
  options?: FancyOption[];
  icon?: React.ReactNode;
  ariaLabel: string;
  /** Quando definido, mostra um filtro no topo do painel (listas grandes). */
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const flat = groups ? groups.flatMap((g) => g.options) : (options ?? []);
  const selected = flat.find((o) => o.value === value);
  const needle = fold(query.trim());
  const visibleGroups = groups
    ? groups.map((g) => ({
        ...g,
        options: needle ? g.options.filter((o) => fold(o.label).includes(needle)) : g.options,
      })).filter((g) => g.options.length > 0)
    : null;
  const visibleFlat = !groups && needle ? flat.filter((o) => fold(o.label).includes(needle)) : flat;

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
      {searchPlaceholder && <div className="fancy-search">
        <Search size={12} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { if (query) { setQuery(""); e.stopPropagation(); } } }}
          placeholder={searchPlaceholder}
        />
      </div>}
      {visibleGroups
        ? visibleGroups.map((group) => <div key={group.label} className="fancy-group">
            <span className="fancy-group-label">{group.label}</span>
            <ul>{group.options.map(renderOption)}</ul>
          </div>)
        : <ul>{visibleFlat.map(renderOption)}</ul>}
    </div>}
  </div>;
}
