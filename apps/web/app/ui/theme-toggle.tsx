"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import type { Theme } from "../../lib/theme/tokens";
import {
  DEFAULT_THEME,
  applyTheme,
  nextTheme,
  readDocumentTheme,
} from "../../lib/theme/theme-preference";

const LABELS: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
};

/**
 * Header control for Alrescha's paired dark/light themes.
 *
 * The rendered markup is theme-agnostic on the server: the inline boot script
 * has already stamped `data-theme` on <html>, and this component syncs to that
 * value on mount, so hydration never disagrees with what is painted.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(readDocumentTheme());
  }, []);

  const target = nextTheme(theme);

  return (
    <button
      aria-label={`${LABELS[target]} 테마로 전환`}
      aria-pressed={theme === "light"}
      className={className ? `theme-toggle ${className}` : "theme-toggle"}
      data-theme-toggle
      data-theme-value={theme}
      onClick={() => {
        applyTheme(target);
        setTheme(target);
      }}
      title={`${LABELS[target]} 테마로 전환`}
      type="button"
    >
      {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
      <span>{LABELS[theme]}</span>
    </button>
  );
}
