// The knobs of scripts/affected-tests.mjs: what counts as shared core, as UI, as a storage change, and how wide a match may be
// before it is narrowed. The rule they encode is the user's 2026-10-03 validation-frequency decision (specs/repository-anti-corruption
// spec §1; docs/system/PARALLEL-DEVELOPMENT.md section 6): batch small changes, build once, run the tests this batch touches,
// run the full suite only for a big change. tests/affected-tests.test.ts checks that every path named here still exists, so a
// rename cannot leave a rule pointing at nothing.

/** Workspace roots: a directory with a package.json under one of these is a workspace package. */
export const PACKAGE_AREAS = ["apps", "packages", "modules", "horizontal", "plugins", "server", "tooling"];

/** Top-level folders that tests reach by path. A string that starts with one of these names a repository path. */
export const REPOSITORY_FOLDERS = [...PACKAGE_AREAS, "scripts", "skills", "docs", "specs", "examples", "vendor", "tests", ".github"];

// ---- when the related tests are not enough (the full suite is recommended) -------------------------------------------------
// "改共享核心 contracts、kernel、modules、local-host 的装配、workbench 外壳，改迁移或存储，改动跨三个以上包，删除整块旧代码，
//  或合入后相关用例意外失败" (spec §1, 2026-10-03). The last cannot be seen from a diff; `--full` states it, and the end of a phase.
export const FULL_REGRESSION = {
  /** Whole packages that are shared core. `modules/` is every package under it. */
  corePackages: ["packages/contracts", "packages/kernel"],
  corePackagePrefixes: ["modules/"],
  /**
   * The assembly of the host and the shell of the workbench: the hub files of PARALLEL-DEVELOPMENT section 2 that wire things
   * together (route dispatch, project host, plugin assembly, the shell and its client program), not the barrels (`index.ts`).
   */
  assemblyFiles: [
    "apps/local-host/src/project-host.ts",
    "apps/local-host/src/project-plugins.ts",
    "apps/local-host/src/web-request.ts",
    "apps/local-host/src/web-catalog.ts",
    "apps/workbench/src/builtin-plugins.ts",
    "apps/workbench/src/immersive-shell.ts",
    "apps/workbench/src/page-assets.ts",
    "apps/workbench/src/plugin-catalog.ts",
    "apps/workbench/src/renderer.ts",
    "apps/workbench/src/ui-composition.ts",
    "apps/workbench/src/scripts/client/initialization.ts",
    "apps/workbench/src/scripts/client/plugin-workbench.ts",
  ],
  /** The storage package, files named for a migration or baseline, and any file whose changed lines define or version a table. */
  storagePackages: ["packages/storage"],
  storageFiles: /(?:^|[/-])(?:migrations?|baselines?)(?:[-./]|$)/,
  storageLines: /\b(?:CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX)|PRAGMA\s+user_version|user_version|applySqliteBaseline)\b/i,
  /** "三个以上包": three or more distinct packages with a non-document change. */
  packageSpan: 3,
  /** "整块旧代码": this many source files deleted (not renamed) in one change. */
  deletedSourceFiles: 3,
};

// ---- what a UI change is ---------------------------------------------------------------------------------------------------
export const UI = {
  /** Packages whose sources are all UI. */
  packages: ["apps/workbench", "packages/design-system", "packages/ui-host", "packages/im-ui"],
  /**
   * A file of any package that is a page, a browser program or a stylesheet, by name or place: `client.ts`, `client-views.ts`,
   * `goals-page-renderer.ts`, `styles.ts`, `ui.ts`, anything in a `client/` or `views/` folder, and css, html and svg files.
   * Not `web-request.ts` (the host's route dispatch) or `viewer.ts`: the word has to stand alone between `/`, `-` and `.`.
   */
  files: /(?:^|[/-])(?:client|clients|styles?|ui|views?|renderers?|pages?)(?:[-.][\w.-]*)?\.(?:ts|mts|css|html|svg)$|\/(?:client|clients|styles|ui|views)\/[^/]+\.(?:ts|mts|css|html|svg)$|\.(?:css|html|svg)$/,
  /** A changed line of a browser program in a template literal, or a page's markup. */
  lines: /\b[A-Z][A-Z0-9_]*_(?:SCRIPT|STYLES?)\b|<style\b|\bclass(?:Name)?\s*=\s*\\?["']|\bclassList\b|\binnerHTML\b|\bdocument\.(?:querySelector|getElementById)\b/,
};

// ---- the rules about what the test touches ---------------------------------------------------------------------------------
/**
 * A changed line in a product source file that calls a translator or has Chinese in a string: the text is shown to people.
 * The calls are the ones scripts/gates/translations.mjs reads: `L(…)`, `x.L(…)`, `p.text(…)`, `primitives.text(…)`, `translate(…)`,
 * `this.t(…)`. A bare `.text(` is not one (`response.text()`).
 */
export const TRANSLATOR_CALL = /(?:^|[^\w$])L\s*\(|\bthis\.t\s*\(|\b(?:p|primitives)\.text\s*\(|\btranslate\s*\(/;
export const CHINESE_LITERAL = /(["'`])[^"'`\n]*\p{Script=Han}[^"'`\n]*\1/u;
/** Where a translation key lives: a dictionary file. */
export const DICTIONARY_FILE = /(?:^|\/)i18n\/|(?:^|\/)(?:[\w-]+-)?en\.ts$/;
export const PRODUCT_SOURCE = /^(?:apps|horizontal|modules|packages|plugins|server|tooling)\/.*\.(?:ts|mts)$/;
export const I18N_TEST = "tests/i18n.test.ts";

/** Files that name a route: a literal "/x/y" in them is a route, anywhere else only "/api/…" and "/__…" are. */
export const ROUTE_FILE = /(?:^|\/)(?:web|http|route|routes|server)[-.\w]*\.(?:ts|mts)$|-(?:http|routes?)\.(?:ts|mts)$|\/(?:http|routes?|web)\//;

// ---- how wide a match may be -----------------------------------------------------------------------------------------------
export const LIMITS = {
  /** A package imported by more tests than this is not selected as a whole; its files and the names they export are. `--wide` lifts it. */
  packageTests: 40,
  /** A name exported by a changed file that more tests mention than this is too common to say anything. */
  symbolTests: 25,
  /** A symbol is at least this long, and is not one of the plain words below. */
  symbolLength: 4,
};

/** Words that are exports of many files and say nothing about which test reads this one. */
export const COMMON_SYMBOLS = new Set([
  "default", "index", "main", "name", "type", "types", "create", "build", "parse", "format", "options", "config", "state", "store",
  "result", "value", "values", "error", "errors", "input", "output", "handler", "context", "client", "server", "service", "route",
  "routes", "actions", "action", "test", "tests", "data", "read", "write", "list", "item", "items", "from", "with", "init",
]);

/** A file stem too generic to name a test: `actions.ts` of a plugin is told by `<package>-actions` instead. */
export const GENERIC_STEMS = new Set([
  "index", "main", "package", "readme", "tsconfig", "types", "type", "utils", "util", "helpers", "client", "server", "routes", "route", "actions", "store", "service",
  "config", "constants", "contract", "contracts", "schema", "schemas", "http", "runtime", "state", "settings", "styles", "style",
  "select", "run", "report", "render", "build", "parse", "format", "load", "read", "write", "common", "shared", "base", "core",
  "model", "models", "log", "api", "app", "view", "views", "page", "pages", "list", "search", "event", "events", "rules", "registry",
  "catalog", "install", "installer", "manifest", "prompt", "prompts", "menu", "dialog", "panel", "form", "tools", "tool",
]);

/** What `pgrep -f` looks for before a run starts (PARALLEL-DEVELOPMENT section 5): another test run, build or tsc on this machine. */
export const SERIAL_PROCESS_PATTERN = "run-tests.mjs|pnpm .*build|tsc ";
