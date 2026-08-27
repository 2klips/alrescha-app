import {
  Activity,
  AlertTriangle,
  Archive,
  BookmarkPlus,
  Bot,
  Braces,
  Brain,
  GitCommitHorizontal,
  LayoutDashboard,
  ListTodo,
  Lock,
  Network,
  ReceiptText,
  SearchCheck,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { NAV } from "../../lib/strings/common";

/**
 * The 5-group IA from the design direction doc (§2.3), for both trees.
 * The workspace tree is the canonical IA; the demo tree is the same IA with
 * fixtures plugged in (its extra Findings/Lint/Receipts/노드 탐색 entries are
 * routes the workspace tree has not shipped yet).
 */

export type ShellTree = "demo" | "workspace";

export interface ShellNavItem {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
}

export interface ShellNavGroup {
  readonly key: keyof typeof NAV.groups;
  readonly items: readonly ShellNavItem[];
}

const DEMO_GROUPS: readonly ShellNavGroup[] = [
  {
    key: "glance",
    items: [{ href: "/", icon: LayoutDashboard, label: NAV.overview }],
  },
  {
    key: "brain",
    items: [
      { href: "/map", icon: Network, label: NAV.graph },
      { href: "/graph", icon: Brain, label: NAV.brainExplore },
    ],
  },
  {
    key: "analysis",
    items: [
      { href: "/commits", icon: GitCommitHorizontal, label: NAV.commits },
      { href: "/findings", icon: AlertTriangle, label: NAV.findings },
      { href: "/lint", icon: Braces, label: NAV.lint },
      { href: "/inspection", icon: SearchCheck, label: NAV.inspection },
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

const WORKSPACE_GROUPS: readonly ShellNavGroup[] = [
  {
    key: "glance",
    items: [{ href: "/app", icon: LayoutDashboard, label: NAV.overview }],
  },
  {
    key: "brain",
    items: [{ href: "/app/map", icon: Network, label: NAV.graph }],
  },
  {
    key: "analysis",
    items: [
      { href: "/app/commits", icon: GitCommitHorizontal, label: NAV.commits },
      { href: "/app/inspection", icon: SearchCheck, label: NAV.inspection },
    ],
  },
  {
    key: "records",
    items: [
      { href: "/app/progress", icon: ListTodo, label: NAV.progress },
      { href: "/app/team", icon: Users, label: NAV.team },
      { href: "/app/harness", icon: BookmarkPlus, label: NAV.harness },
      { href: "/app/library", icon: Archive, label: NAV.library },
    ],
  },
  {
    key: "settings",
    items: [
      { href: "/app/stats", icon: Activity, label: NAV.stats },
      { href: "/app/settings/mcp", icon: Settings, label: NAV.settingsMcp },
      { href: "/app/settings/ai", icon: Bot, label: NAV.settingsAi },
      { href: "/app/settings/privacy", icon: Lock, label: NAV.settingsPrivacy },
    ],
  },
] as const;

export function shellNavGroups(tree: ShellTree): readonly ShellNavGroup[] {
  return tree === "demo" ? DEMO_GROUPS : WORKSPACE_GROUPS;
}

export function shellHome(tree: ShellTree): string {
  return tree === "demo" ? "/" : "/app";
}

/** Active-state matching: exact on the tree home, prefix elsewhere. */
export function isShellNavActive(
  pathname: string,
  href: string,
  tree: ShellTree,
): boolean {
  if (href === shellHome(tree)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
