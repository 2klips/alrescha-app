// Client component by inheritance: imported only from `side-nav.tsx`
// ("use client"). No own directive, so it never becomes a client entry whose
// props would need to be serializable.
import { CornerDownLeft, MoonStar, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyTheme,
  nextTheme,
  readDocumentTheme,
} from "../../lib/theme/theme-preference";
import { NAV } from "../../lib/strings/common";
import { SHELL } from "../../lib/strings/shell";
import { shellNavGroups, type ShellTree } from "./shell-nav-data";

interface PaletteEntry {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly run: () => void;
}

/**
 * Dependency-free ⌘K palette (design §2.5: 사이드바가 지도, ⌘K가 텔레포터).
 * v1 scope: every route of the current tree plus the theme action; entity
 * search (노드 ID · 커밋 SHA · finding) lands with the search index work.
 */
export function CommandPalette({
  onClose,
  open,
  tree,
}: {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly tree: ShellTree;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const entries = useMemo<readonly PaletteEntry[]>(() => {
    const routes = shellNavGroups(tree).flatMap((group) =>
      group.items.map((item) => ({
        group: NAV.groups[group.key],
        id: item.href,
        label: item.label,
        run: () => router.push(item.href),
      })),
    );
    return [
      ...routes,
      {
        group: NAV.groups.settings,
        id: "action:theme",
        label: SHELL.palette.themeAction,
        run: () => applyTheme(nextTheme(readDocumentTheme())),
      },
    ];
  }, [router, tree]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) ||
        entry.id.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  function runEntry(entry: PaletteEntry | undefined) {
    if (!entry) return;
    entry.run();
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runEntry(matches[cursor]);
    }
  }

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        aria-label={SHELL.palette.aria}
        aria-modal="true"
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
      >
        <div className="command-palette-input">
          <Search aria-hidden size={15} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={SHELL.palette.placeholder}
            ref={inputRef}
            value={query}
          />
        </div>
        <ul className="command-palette-list" role="listbox">
          {matches.length === 0 ? (
            <li className="command-palette-empty">{SHELL.palette.empty}</li>
          ) : (
            matches.map((entry, index) => (
              <li key={entry.id}>
                <button
                  aria-selected={index === cursor}
                  className="command-palette-item"
                  data-active={index === cursor || undefined}
                  onClick={() => runEntry(entry)}
                  onMouseEnter={() => setCursor(index)}
                  role="option"
                  type="button"
                >
                  {entry.id === "action:theme" ? (
                    <MoonStar aria-hidden size={14} />
                  ) : (
                    <CornerDownLeft aria-hidden size={14} />
                  )}
                  <span>{entry.label}</span>
                  <small>{entry.group}</small>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
