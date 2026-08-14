"use client";

import { useState } from "react";

import { createClient } from "../../../lib/supabase/client";

export function SignInButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/app` },
    });

    if (signInError) {
      setError("GitHub 로그인을 시작하지 못했습니다.");
      setPending(false);
    }
  }

  return (
    <div>
      <button className="button" disabled={pending} onClick={signIn} type="button">
        {pending ? "GitHub 연결 중…" : "GitHub으로 시작"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

