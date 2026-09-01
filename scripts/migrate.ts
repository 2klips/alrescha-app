import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postgres from "postgres";

export interface MigrationFile {
  readonly checksum: string;
  readonly name: string;
  readonly sql: string;
}

interface MigrationIdentity {
  readonly migrationName: string;
  readonly version: string;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_MIGRATIONS_DIRECTORY = resolve(
  ROOT,
  "supabase/migrations",
);

export function getMigrationIdentity(name: string): MigrationIdentity {
  const match = /^(\d{12})_([a-z0-9_]+)\.sql$/.exec(name);
  if (!match) {
    throw new Error(`Invalid migration filename: ${name}`);
  }

  return {
    migrationName: match[2]!,
    version: match[1]!,
  };
}

export async function loadMigrations(
  directory = DEFAULT_MIGRATIONS_DIRECTORY,
): Promise<readonly MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{12}_[a-z0-9_]+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(directory, name), "utf8");
      return {
        checksum: createHash("sha256").update(sql).digest("hex"),
        name,
        sql,
      };
    }),
  );
}

export async function runMigrations(
  databaseUrl: string,
): Promise<readonly string[]> {
  const sql = postgres(databaseUrl, { max: 1 });
  const applied: string[] = [];

  try {
    await sql.unsafe(
      "select pg_advisory_lock(hashtext('alrescha_migrations'))",
    );
    await sql.unsafe("create schema if not exists private_migrations");
    await sql.unsafe(`
      create table if not exists private_migrations.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);
    const standardLedger = await sql<{ table_name: string | null }[]>`
      select to_regclass(
        'supabase_migrations.schema_migrations'
      )::text as table_name
    `;
    const hasStandardLedger = Boolean(standardLedger[0]?.table_name);

    for (const migration of await loadMigrations()) {
      const identity = getMigrationIdentity(migration.name);
      const existing = await sql<{ checksum: string }[]>`
        select checksum
        from private_migrations.schema_migrations
        where name = ${migration.name}
      `;

      if (existing[0]) {
        if (existing[0].checksum !== migration.checksum) {
          throw new Error(
            `Applied migration checksum changed: ${migration.name}`,
          );
        }
        continue;
      }

      if (hasStandardLedger) {
        const standard = await sql<{ name: string | null }[]>`
          select name
          from supabase_migrations.schema_migrations
          where version = ${identity.version}
        `;

        if (standard[0]) {
          if (standard[0].name && standard[0].name !== identity.migrationName) {
            throw new Error(
              `Supabase migration name changed: ${migration.name}`,
            );
          }
          await sql`
            insert into private_migrations.schema_migrations (name, checksum)
            values (${migration.name}, ${migration.checksum})
          `;
          continue;
        }
      }

      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration.sql);
        await transaction`
          insert into private_migrations.schema_migrations (name, checksum)
          values (${migration.name}, ${migration.checksum})
        `;
        if (hasStandardLedger) {
          await transaction`
            insert into supabase_migrations.schema_migrations (
              version,
              statements,
              name
            )
            values (
              ${identity.version},
              ${transaction.array([migration.sql])},
              ${identity.migrationName}
            )
          `;
        }
      });
      applied.push(migration.name);
    }

    return applied;
  } finally {
    try {
      await sql.unsafe(
        "select pg_advisory_unlock(hashtext('alrescha_migrations'))",
      );
    } finally {
      await sql.end();
    }
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const applied = await runMigrations(databaseUrl);
  process.stdout.write(
    applied.length === 0
      ? "Database already current.\n"
      : `Applied: ${applied.join(", ")}\n`,
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
