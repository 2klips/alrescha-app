import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section className="shell">
        <div className="eyebrow">404 / route not found</div>
        <h1>Nothing here.</h1>
        <p>This route is outside the SpecProof workspace.</p>
        <Link href="/">Return to app shell</Link>
      </section>
    </main>
  );
}

