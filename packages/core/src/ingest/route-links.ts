/**
 * Route declarations a scan can read without running anything (Phase 4
 * Wave A′ todo 6, design ② / GitNexus).
 *
 * Two frameworks, two tiers, for the same reason the code resolver has two:
 *
 * - **Next.js** puts the URL in the path (`app/**‍/page.tsx`), so the route is
 *   `resolved` — and it is derived in SQL from the stored paths, not here, so
 *   the plan cannot express a route and the two ingest paths cannot disagree
 *   about one (ADR-013, the same rule the directory hierarchy follows).
 * - **FastAPI and Flask** put it in a decorator, which only the file body
 *   states. That reading is a regex over source that is already in memory
 *   during the scan, so it is `reference`: a decorator on a router mounted
 *   under a prefix produces a path this cannot see (ADR-014 — no import
 *   graph, no execution, no guessing).
 *
 * Only the method, the path and the line travel. The decorator's arguments,
 * the handler's name and the file's text stay where they are (WORK_SPEC §3-3).
 */

/** Verbs both frameworks spell the same way. */
const HTTP_METHODS = [
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
] as const;

export type RouteMethod = Uppercase<(typeof HTTP_METHODS)[number]> | "ANY";

export interface ParsedRouteDeclaration {
  readonly line: number;
  readonly method: RouteMethod;
  /** The path as written in the decorator, never a guessed full URL. */
  readonly path: string;
}

export interface RouteDeclaration extends ParsedRouteDeclaration {
  readonly sourcePath: string;
}

/**
 * `@app.get("/x")`, `@router.post('/items/{id}')`, `@bp.route("/y")`. The
 * object the decorator hangs off is deliberately unconstrained: projects call
 * it `app`, `router`, `bp`, `api`, or anything else.
 */
const DECORATOR =
  /^\s*@\s*[\w.]+\.(delete|get|head|options|patch|post|put|route)\s*\(\s*(?:path\s*=\s*)?(['"])([^'"\n]{1,400})\2/;
/** Flask states its verbs in an argument: `methods=["GET", "POST"]`. */
const FLASK_METHODS = /methods\s*=\s*\[([^\]]{0,200})\]/i;
const METHOD_NAME = /['"]([A-Za-z]+)['"]/g;

function methodsOf(decorator: string, verb: string): RouteMethod[] {
  if (verb !== "route") return [verb.toUpperCase() as RouteMethod];
  const declared = FLASK_METHODS.exec(decorator);
  if (!declared?.[1]) return ["ANY"];
  const methods = [...declared[1].matchAll(METHOD_NAME)]
    .map(([, name]) => (name ?? "").toUpperCase())
    .filter((name): name is RouteMethod =>
      (HTTP_METHODS as readonly string[]).includes(name.toLowerCase()),
    );
  return methods.length > 0 ? methods : ["ANY"];
}

/**
 * Route declarations in one Python file. Line numbers are 1-based and point
 * at the decorator, which is what a reader wants to open.
 */
export function parsePythonRoutes(
  source: string,
): readonly ParsedRouteDeclaration[] {
  const declarations: ParsedRouteDeclaration[] = [];
  const lines = source.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match = DECORATOR.exec(line);
    if (!match?.[1] || !match[3]) continue;
    const path = match[3].trim();
    if (!path.startsWith("/")) continue;
    for (const method of methodsOf(line, match[1])) {
      declarations.push({ line: index + 1, method, path });
    }
  }
  return declarations;
}

/**
 * The URL a Next.js file serves, or null when it serves none.
 *
 * The persisted route nodes are derived by `apply_repository_scan` from the
 * same rule; `tests/route-nodes.test.ts` pins the two against each other,
 * because two implementations of one rule is a drift waiting to happen and
 * the alternative — carrying routes in the plan — is the ADR-013 problem the
 * SQL derivation exists to avoid.
 */
const APP_ROUTE =
  /(?:^|\/)app\/(.*?)(?:^|\/)?(page|layout|route)\.[cm]?[jt]sx?$/;
const PAGES_ROUTE = /(?:^|\/)pages\/(.+)\.[cm]?[jt]sx?$/;
const PAGES_NON_ROUTE = /(?:^|\/)_(?:app|document|middleware|error)$/;
const ROUTE_GROUP = /^\(.*\)$/;

export interface NextRouteFile {
  /** `layout` files serve every URL beneath them, not one of their own. */
  readonly entry: "layout" | "page" | "route";
  readonly url: string;
}

export function nextRouteFile(path: string): NextRouteFile | null {
  const app = APP_ROUTE.exec(path);
  if (app) {
    return {
      entry: (app[2] ?? "page") as NextRouteFile["entry"],
      url: routeUrl(app[1] ?? ""),
    };
  }
  const pages = PAGES_ROUTE.exec(path);
  if (!pages?.[1]) return null;
  const withoutIndex = pages[1].replace(/\/?index$/, "");
  if (PAGES_NON_ROUTE.test(`/${withoutIndex}`)) return null;
  return { entry: "page", url: routeUrl(withoutIndex) };
}

function routeUrl(directory: string): string {
  const segments = directory
    .split("/")
    .filter((segment) => segment.length > 0 && !ROUTE_GROUP.test(segment));
  return `/${segments.join("/")}`;
}
