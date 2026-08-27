"use client";

import { PanelLeft, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  applySidebarState,
  nextSidebarState,
  readDocumentSidebarState,
} from "../../lib/shell/sidebar-preference";
import { ACTION, BRAND, NAV } from "../../lib/strings/common";
import { SHELL } from "../../lib/strings/shell";
import { CommandPalette } from "./command-palette";
import {
  isShellNavActive,
  shellHome,
  shellNavGroups,
  type ShellTree,
} from "./shell-nav-data";
import { ThemeToggle } from "./theme-toggle";

/**
 * AppShell sidebar (design roadmap step 2). Extends the Phase 2D grouped
 * SideNav to the 5-group IA, adds the brand row, the ⌘K search row, and the
 * collapse-to-icon-rail toggle (⌘B / Ctrl+B, persisted via
 * `lib/shell/sidebar-preference.ts` — same no-flicker boot-script mechanism
 * as the theme).
 */
export function SideNav({ tree }: { readonly tree: ShellTree }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    setCollapsed(readDocumentSidebarState() === "rail");
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === "b") {
        event.preventDefault();
        const next = nextSidebarState(readDocumentSidebarState());
        applySidebarState(next);
        setCollapsed(next === "rail");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    const next = nextSidebarState(readDocumentSidebarState());
    applySidebarState(next);
    setCollapsed(next === "rail");
  }

  return (
    <nav aria-label={NAV.ariaPrimary} className="side-nav" data-tree={tree}>
      <Link
        aria-label={BRAND.homeLabel}
        className="side-nav-brand"
        href={shellHome(tree)}
      >
        <Image
          alt=""
          className="side-nav-mark"
          height={20}
          src="/arr-mark.png"
          width={20}
        />
        <strong>{BRAND.name}</strong>
        <span className="side-nav-tagline">{BRAND.tagline}</span>
      </Link>
      <button
        className="side-nav-search"
        onClick={() => setPaletteOpen(true)}
        type="button"
      >
        <Search aria-hidden size={15} />
        <span className="side-nav-item-label">{ACTION.search}</span>
        <kbd aria-hidden>{SHELL.sidebar.searchHint}</kbd>
      </button>
      {shellNavGroups(tree).map((group) => (
        <div className="side-nav-group" key={group.key}>
          <span className="side-nav-label">{NAV.groups[group.key]}</span>
          {group.items.map(({ href, icon: Icon, label }) => (
            <Link
              aria-current={
                isShellNavActive(pathname, href, tree) ? "page" : undefined
              }
              href={href}
              key={href}
              title={label}
            >
              <Icon aria-hidden size={15} />
              <span className="side-nav-item-label">{label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div className="side-nav-foot">
        <button
          aria-label={SHELL.sidebar.collapseToggle}
          aria-pressed={collapsed ?? undefined}
          className="side-nav-collapse"
          onClick={toggleCollapsed}
          type="button"
        >
          <PanelLeft aria-hidden size={15} />
        </button>
        <ThemeToggle />
      </div>
      <CommandPalette
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
        tree={tree}
      />
    </nav>
  );
}
