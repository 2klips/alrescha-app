import type { ReactNode } from "react";

import { SettingsLocalNav } from "../../../ui/settings-local-nav";

export default function SettingsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="settings-route-layout">
      <SettingsLocalNav />
      <div className="settings-route-content">{children}</div>
    </div>
  );
}
