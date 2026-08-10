import { githubInstallationUrl } from "@specproof/core";
import { redirect } from "next/navigation";

import { getCurrentUserId } from "../../../../lib/auth/current-user";
import { githubAppEnvironment } from "../../../../lib/github/env";
import { createGitHubInstallState } from "../../../../lib/github/state";
import { createClient } from "../../../../lib/supabase/server";

export default async function ConnectGitHubPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const workspaceResult = await supabase.from("workspaces").select("id").limit(1).single();
  if (workspaceResult.error || !workspaceResult.data) {
    throw new Error("Personal workspace is unavailable.");
  }

  const environment = githubAppEnvironment();
  const state = createGitHubInstallState(environment.installStateSecret, {
    userId,
    workspaceId: workspaceResult.data.id,
  });
  const installationUrl = githubInstallationUrl(environment.appSlug, state);

  return (
    <main>
      <section className="shell" aria-labelledby="connect-title">
        <div className="eyebrow">GitHub App connection</div>
        <h1 id="connect-title">Connect a repository.</h1>
        <p>기본 연결은 읽기 전용입니다. 설치 화면에서 접근할 레포를 직접 선택합니다.</p>
        <ul>
          <li>Contents: read — 명세·지침·코드 메타데이터 스캔</li>
          <li>Checks: read — 검증 결과 수집</li>
          <li>Actions: read — 실행 아티팩트 수집</li>
          <li>Metadata: read — 레포 식별</li>
        </ul>
        <a className="button" href={installationUrl}>GitHub App 설치</a>
        <p>
          PR 제안 기능은 기본 권한에 포함되지 않습니다. 사용자가 기능을 켤 때
          <code> pull_requests:write</code>만 별도 승인받습니다.
        </p>
      </section>
    </main>
  );
}
