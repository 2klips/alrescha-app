/**
 * Replay the GitHub App's stored webhook deliveries into a local stack
 * (Phase 2C todo 5).
 *
 * The live pilot runs against a laptop: the tunnel drops, the dev server
 * restarts, Docker falls over. GitHub keeps every delivery for a fortnight and
 * will re-send it on request, so a pilot never has to be re-pushed just because
 * the machine was down when the event arrived.
 *
 * Two details that are easy to get wrong:
 *  - Delivery ids exceed Number.MAX_SAFE_INTEGER. `JSON.parse` rounds them and
 *    every redelivery answers 404, so the ids are read out of the raw response
 *    text instead of a parsed object.
 *  - Order matters. `push` has to land before the `check_run` and
 *    `workflow_run` results that reference the same commit, so deliveries are
 *    replayed oldest first with a pause between them.
 *
 * Usage: node --import tsx scripts/replay-github-deliveries.ts
 */

import { createSign } from "node:crypto";

const GAP_MS = 3_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function appJwt(appId: string, privateKey: string, now = Date.now()): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(now / 1000) - 60;
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    exp: issuedAt + 10 * 60,
    iat: issuedAt,
    iss: appId,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

export interface StoredDelivery {
  readonly action: string | null;
  readonly deliveredAt: string;
  readonly event: string;
  /** Kept as text: the value does not survive a round trip through a number. */
  readonly id: string;
  readonly repositoryId: string | null;
}

/** Read deliveries out of the raw list response without parsing the ids. */
export function parseDeliveries(responseText: string): StoredDelivery[] {
  const deliveries: StoredDelivery[] = [];
  for (const match of responseText.matchAll(
    /\{"id":(\d+),(.*?)"throttled_at"/gs,
  )) {
    const body = match[2] ?? "";
    const field = (name: string): string | null => {
      const found = new RegExp(`"${name}":(?:"([^"]*)"|(null|\\d+))`).exec(
        body,
      );
      if (!found) return null;
      return found[1] ?? (found[2] === "null" ? null : (found[2] ?? null));
    };
    deliveries.push({
      action: field("action"),
      deliveredAt: field("delivered_at") ?? "",
      event: field("event") ?? "",
      id: match[1] ?? "",
      repositoryId: field("repository_id"),
    });
  }
  return deliveries;
}

async function main(): Promise<void> {
  process.loadEnvFile("apps/web/.env.local");
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${appJwt(
      required("GITHUB_APP_ID"),
      required("GITHUB_APP_PRIVATE_KEY").replaceAll("\\n", "\n"),
    )}`,
    "x-github-api-version": "2022-11-28",
  };

  const listed = await fetch(
    "https://api.github.com/app/hook/deliveries?per_page=50",
    { headers },
  );
  if (!listed.ok) {
    throw new Error(`Could not list deliveries: ${listed.status}`);
  }

  // Repository events only — `installation` and `ping` carry no commit.
  const wanted = parseDeliveries(await listed.text())
    .filter((delivery) => delivery.repositoryId !== null)
    .sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt));

  for (const delivery of wanted) {
    const res = await fetch(
      `https://api.github.com/app/hook/deliveries/${delivery.id}/attempts`,
      { headers, method: "POST" },
    );
    console.log(
      `${delivery.deliveredAt}  ${delivery.event}.${delivery.action ?? "-"}  → ${res.status}`,
    );
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }
  console.log(`\n${wanted.length} deliveries replayed`);
}

if (process.argv[1]?.endsWith("replay-github-deliveries.ts")) {
  await main();
}
