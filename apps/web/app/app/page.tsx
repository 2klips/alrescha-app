import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../lib/auth/current-user";
import { createClient } from "../../lib/supabase/server";

export default async function WorkspacePage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const { data: workspaces } = await supabase.from("workspaces").select("id, name").limit(1);
  const workspace = workspaces?.[0];

  return (
    <main>
      <section className="shell" aria-labelledby="workspace-title">
        <div className="eyebrow">Personal workspace</div>
        <h1 id="workspace-title">{workspace?.name ?? "Workspace ready"}</h1>
        <p data-user-id={userId}>GitHub 레포를 연결하면 첫 증거 스캔을 시작합니다.</p>
      </section>
    </main>
  );
}

