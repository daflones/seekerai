"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Lista paginada client-side: recebe os <li> já renderizados (RSC) e fatia por página.
export function FinList({
  children,
  pageSize = 15,
  className,
}: {
  children: ReactNode;
  pageSize?: number;
  className?: string;
}) {
  const items = Children.toArray(children);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(page, pages);
  const slice = items.slice((safe - 1) * pageSize, safe * pageSize);

  return (
    <>
      <ul className={className}>{slice}</ul>
      {pages > 1 && (
        <div className="fin-pager">
          <button type="button" disabled={safe <= 1} onClick={() => setPage(safe - 1)} aria-label="Página anterior">
            <ChevronLeft size={14} /> Anterior
          </button>
          <span>
            {safe} <em>/</em> {pages}
          </span>
          <button type="button" disabled={safe >= pages} onClick={() => setPage(safe + 1)} aria-label="Próxima página">
            Próxima <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
