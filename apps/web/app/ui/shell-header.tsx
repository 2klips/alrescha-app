"use client";

import { CircleUserRound, ExternalLink, Network, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BRAND, NAV } from "../../lib/strings/common";
import { SHELL } from "../../lib/strings/shell";
import { CommandPalette } from "./command-palette";
import {
  isShellNavActive,
  shellHome,
  shellTabs,
  type ShellTree,
} from "./shell-nav-data";
import { ThemeToggle } from "./theme-toggle";

/**
 * Interactive leaf of the repository shell. The server-owned AppShell keeps
 * data loading outside the client bundle; this component owns only pathname
 * state, keyboard search, theme control, and links.
 */
export function ShellHeader({ tree }: { readonly tree: ShellTree }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header aria-label={SHELL.global.aria} className="global-header">
        <Link
          aria-label={BRAND.homeLabel}
          className="global-header-brand"
          href={shellHome(tree)}
        >
          <span aria-hidden className="global-header-mark">
            <Network size={18} strokeWidth={1.8} />
          </span>
          <strong>{BRAND.name}</strong>
        </Link>
        <button
          aria-controls="shell-command-palette"
          aria-expanded={paletteOpen}
          aria-haspopup="dialog"
          className="global-search"
          onClick={() => setPaletteOpen(true)}
          type="button"
        >
          <Search aria-hidden size={16} />
          <span>{SHELL.global.search}</span>
          <kbd aria-hidden>{SHELL.global.searchHint}</kbd>
        </button>
        <div className="global-header-actions">
          <ThemeToggle />
          <Link
            className="global-account-link"
            href={tree === "workspace" ? "/app/settings" : "/app"}
          >
            {tree === "workspace" ? (
              <CircleUserRound aria-hidden size={16} />
            ) : (
              <ExternalLink aria-hidden size={16} />
            )}
            <span>{tree === "workspace" ? NAV.account : NAV.openApp}</span>
          </Link>
        </div>
      </header>
      <CommandPalette
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
        tree={tree}
      />
    </>
  );
}

/** Current-route state is isolated from the otherwise server-rendered shell. */
export function RepositoryTabs({ tree }: { readonly tree: ShellTree }) {
  const pathname = usePathname();

  return (
    <nav aria-label={NAV.ariaRepository} className="repository-tabs">
      <div className="repository-tabs-inner">
        {shellTabs(tree).map(({ href, icon: Icon, label }) => {
          const active = isShellNavActive(pathname, href, tree);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              data-state={active ? "selected" : "default"}
              href={href}
              key={href}
            >
              <Icon aria-hidden size={16} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
