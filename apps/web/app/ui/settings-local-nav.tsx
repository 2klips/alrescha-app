"use client";

import { Activity, Bot, PlugZap, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV } from "../../lib/strings/common";
import { SHELL } from "../../lib/strings/shell";

const ITEMS = [
  { href: "/app/settings", icon: Settings, label: NAV.settingsIndex },
  { href: "/app/settings/mcp", icon: PlugZap, label: NAV.settingsMcp },
  { href: "/app/settings/ai", icon: Bot, label: NAV.settingsAi },
  {
    href: "/app/settings/privacy",
    icon: ShieldCheck,
    label: NAV.settingsPrivacy,
  },
  { href: "/app/stats", icon: Activity, label: NAV.stats },
] as const;

export function SettingsLocalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={SHELL.settingsNav.aria} className="settings-local-nav">
      {ITEMS.map(({ href, icon: Icon, label }) => {
        const current =
          href === "/app/settings"
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            data-state={current ? "selected" : "default"}
            href={href}
            key={href}
          >
            <Icon aria-hidden size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
