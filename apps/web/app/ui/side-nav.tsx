"use client";

import {
  AlertTriangle,
  Archive,
  BookmarkPlus,
  Braces,
  Brain,
  GitCommitHorizontal,
  LayoutDashboard,
  ListTodo,
  Network,
  ReceiptText,
  SearchCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV } from "../../lib/strings/common";
import { ThemeToggle } from "./theme-toggle";

/**
 * Grouped sidebar (Phase 2D todo 2) — the four groups the redesign fixed:
 * 한눈에 / 분석 / Data Brain / 기록·자산. Labels come from NAV so the
 * Korean-first sweep owns every word.
 */

const GROUPS = [
  {
    key: "glance",
    items: [{ href: "/", icon: LayoutDashboard, label: NAV.overview }],
  },
  {
    key: "analysis",
    items: [
      { href: "/commits", icon: GitCommitHorizontal, label: NAV.commits },
      { href: "/findings", icon: AlertTriangle, label: NAV.findings },
      { href: "/inspection", icon: SearchCheck, label: NAV.inspection },
      { href: "/lint", icon: Braces, label: NAV.lint },
    ],
  },
  {
    key: "brain",
    items: [
      { href: "/map", icon: Network, label: NAV.graph },
      { href: "/graph", icon: Brain, label: NAV.brainExplore },
    ],
  },
  {
    key: "records",
    items: [
      { href: "/progress", icon: ListTodo, label: NAV.progress },
      { href: "/receipts", icon: ReceiptText, label: NAV.receipts },
      { href: "/team", icon: Users, label: NAV.team },
      { href: "/harness", icon: BookmarkPlus, label: NAV.harness },
      { href: "/library", icon: Archive, label: NAV.library },
    ],
  },
] as const;

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav aria-label={NAV.ariaPrimary} className="side-nav">
      {GROUPS.map((group) => (
        <div className="side-nav-group" key={group.key}>
          <span className="side-nav-label">{NAV.groups[group.key]}</span>
          {group.items.map(({ href, icon: Icon, label }) => (
            <Link
              aria-current={pathname === href ? "page" : undefined}
              href={href}
              key={href}
            >
              <Icon aria-hidden size={15} />
              {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="side-nav-foot">
        <ThemeToggle />
      </div>
    </nav>
  );
}
