import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { NAV, SETTINGS } from "../../../../lib/strings";

export const dynamic = "force-dynamic";

/**
 * `/app/settings` index (design roadmap step 2) — the landing point for the
 * sidebar's 설정 group, which previously 404ed.
 */
export default async function SettingsIndexPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/auth/login");

  const entries = [
    {
      body: SETTINGS.index.cards.mcp,
      href: "/app/settings/mcp",
      label: NAV.settingsMcp,
    },
    {
      body: SETTINGS.index.cards.ai,
      href: "/app/settings/ai",
      label: NAV.settingsAi,
    },
    {
      body: SETTINGS.index.cards.privacy,
      href: "/app/settings/privacy",
      label: NAV.settingsPrivacy,
    },
    {
      body: SETTINGS.index.cards.stats,
      href: "/app/stats",
      label: NAV.stats,
    },
  ] as const;

  return (
    <main className="mcp-settings-shell">
      <header>
        <div className="eyebrow">{SETTINGS.index.eyebrow}</div>
        <h1>{SETTINGS.index.title}</h1>
        <p>{SETTINGS.index.body}</p>
      </header>
      <ul className="settings-index-list">
        {entries.map((entry) => (
          <li key={entry.href}>
            <Link href={entry.href}>
              <strong>{entry.label}</strong>
              <span>{entry.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
