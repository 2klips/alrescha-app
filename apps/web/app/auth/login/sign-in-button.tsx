"use client";

import { useState } from "react";

import { Button } from "../../ui/button";
import { AUTH } from "../../../lib/strings";
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
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/app`,
      },
    });

    if (signInError) {
      setError(AUTH.signIn.error);
      setPending(false);
    }
  }

  return (
    <div>
      <Button disabled={pending} onClick={signIn} size="md" variant="primary">
        {pending ? AUTH.signIn.pending : AUTH.signIn.idle}
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
