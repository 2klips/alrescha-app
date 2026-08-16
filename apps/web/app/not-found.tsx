import Link from "next/link";

import { NOT_FOUND } from "../lib/strings";

export default function NotFound() {
  return (
    <main>
      <section className="shell">
        <div className="eyebrow">{NOT_FOUND.eyebrow}</div>
        <h1>{NOT_FOUND.title}</h1>
        <p>{NOT_FOUND.body}</p>
        <Link href="/">{NOT_FOUND.cta}</Link>
      </section>
    </main>
  );
}
