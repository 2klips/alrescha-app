import Link from "next/link";

import { AUTH } from "../../../lib/strings";

export default function AuthCodeErrorPage() {
  return (
    <main>
      <section className="shell">
        <div className="eyebrow">{AUTH.codeError.eyebrow}</div>
        <h1>{AUTH.codeError.title}</h1>
        <p>{AUTH.codeError.body}</p>
        <Link href="/auth/login">{AUTH.codeError.back}</Link>
      </section>
    </main>
  );
}
