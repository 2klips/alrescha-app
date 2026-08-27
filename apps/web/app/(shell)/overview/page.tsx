import { redirect } from "next/navigation";

/** The overview moved to the root (Phase 2D todo 6); keep old links working. */
export default function OverviewRedirect() {
  redirect("/");
}
