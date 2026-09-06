import type {
  InstructionCostTable as InstructionCostTableData,
  InstructionLoadMode,
} from "@alrescha/core";

import { HARNESS } from "../../lib/strings";

const number = (value: number): string => value.toLocaleString("en-US");

/**
 * WORK_SPEC §5.2-③ 표1 — what the harness costs before anyone types
 * anything (Phase 4 Wave E todo 24).
 *
 * The header states the tokenizer assumption because the spec asks it to,
 * and because the number under it is a byte count divided by four. The four
 * loading modes stay in four totals: only the unconditional one is the
 * "always loaded" figure, and a conditional file or an unreadable Cursor
 * rule is shown beside it rather than folded into it.
 */
export function InstructionCostTable({
  repositoryNames,
  table,
}: {
  readonly repositoryNames?: ReadonlyMap<string, string>;
  readonly table: InstructionCostTableData;
}) {
  if (table.rows.length === 0) return null;

  const modeLabel = (mode: InstructionLoadMode): string =>
    HARNESS.cost.modes[mode];

  return (
    <section aria-label={HARNESS.cost.aria} className="harness-cost">
      <h2>{HARNESS.cost.title}</h2>
      <p className="harness-cost-assumption">
        {HARNESS.cost.assumption(table.assumption.charsPerToken)}
      </p>

      <table className="harness-cost-table">
        <thead>
          <tr>
            <th scope="col">{HARNESS.cost.columns.file}</th>
            <th scope="col">{HARNESS.cost.columns.loader}</th>
            <th scope="col">{HARNESS.cost.columns.mode}</th>
            <th scope="col">{HARNESS.cost.columns.bytes}</th>
            <th scope="col">{HARNESS.cost.columns.tokens}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <code>{row.path}</code>
                {repositoryNames?.get(row.repositoryId) ? (
                  <small>{repositoryNames.get(row.repositoryId)}</small>
                ) : null}
              </th>
              <td>
                {row.loaders
                  .map(({ loader }) => HARNESS.cost.loaders[loader])
                  .join(", ")}
              </td>
              <td>
                <span className={`harness-cost-mode ${row.mode}`}>
                  {modeLabel(row.mode)}
                </span>
                {/* The reason, verbatim: a loading rule a reader cannot
                    check is a rule they have to trust. */}
                <small>{row.loaders[0]?.reason}</small>
              </td>
              <td>{number(row.sizeBytes)}</td>
              <td>{number(row.estimatedTokens)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{HARNESS.cost.totals.always}</th>
            <td colSpan={2}>
              {HARNESS.cost.totals.alwaysFiles(table.totals.alwaysFiles)}
            </td>
            <td>{number(table.totals.alwaysSizeBytes)}</td>
            <td>{number(table.totals.alwaysTokens)}</td>
          </tr>
          <tr>
            <th scope="row">{HARNESS.cost.totals.excluded}</th>
            <td colSpan={3}>
              {HARNESS.cost.totals.excludedDetail(
                table.totals.conditionalTokens,
                table.totals.onDemandTokens,
                table.totals.unknownTokens,
              )}
            </td>
            <td>—</td>
          </tr>
        </tfoot>
      </table>

      <ul className="harness-cost-loaders">
        {table.totals.perLoader.map((total) => (
          <li key={total.loader}>
            {HARNESS.cost.perLoader(
              HARNESS.cost.loaders[total.loader],
              total.alwaysTokens,
              total.alwaysFiles,
              total.unresolvedFiles,
              total.files,
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
