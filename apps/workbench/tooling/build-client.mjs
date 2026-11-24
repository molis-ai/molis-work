import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";

const compactor = fileURLToPath(new URL("../../../scripts/client-literals.mjs", import.meta.url));
const compactClientScript = (source) => execFileSync(process.execPath, [compactor], {
  input: source,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  stdio: ["pipe", "pipe", "inherit"],
});

const DEFAULT_BROWSER = {
  bundle: true,
  format: "iife",
  platform: "browser",
  minify: true,
  charset: "utf8",
};

/**
 * All Workbench browser IIFE bundles consolidated into one esbuild worker process (102-1).
 * The four special-flag entries preserve exact historical flags (personal-account without minifySyntax,
 * write-checkers banner/footer, and es2022/no-legal-comments targets).
 */
const BROWSER_BUNDLES = [
  {
    entryPoints: ["src/browser/personal-account.ts"],
    outfile: "dist/scripts/personal-account-client.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    charset: "utf8",
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: false,
    legalComments: "none",
  },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/knowledge/entry.ts"], outfile: "dist/knowledge-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/kit/entry.ts"], outfile: "dist/kit-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/kit/loader.ts"], outfile: "dist/kit-loader.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/work-records/entry.ts"], outfile: "dist/work-records-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/work-records/loader.ts"], outfile: "dist/work-records-loader.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/characters/entry.ts"], outfile: "dist/characters-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/characters/loader.ts"], outfile: "dist/characters-loader.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/sessions/entry.ts"], outfile: "dist/sessions-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/installed-plugin/entry.ts"], outfile: "dist/installed-plugin-client.js" },
  {
    ...DEFAULT_BROWSER,
    entryPoints: ["src/browser/write-checkers-factory.ts"],
    banner: { js: "const molisWorkWriteCheckers = (host) => {" },
    footer: { js: "}" },
    outfile: "dist/write-checkers-client.js",
  },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/project-directories-entry.ts"], outfile: "dist/project-directories-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/settings-view-height.ts"], outfile: "dist/settings-view-height-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/conditions-frame.ts"], outfile: "dist/board-conditions-frame.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/conditions-section.ts"], outfile: "dist/board-conditions-section.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/collab-section.ts"], outfile: "dist/board-collab-section.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/service-connection-section.ts"], outfile: "dist/board-service-connection-section.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/platform-area-section.ts"], outfile: "dist/board-platform-area-section.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/environment-section.ts"], outfile: "dist/board-environment-section.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/model-settings-progress.ts"], outfile: "dist/model-settings-progress.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/connections-page.ts"], outfile: "dist/connections-page-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/task-grants-page.ts"], outfile: "dist/task-grants-page-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/navigation-frame.ts"], outfile: "dist/board-navigation-frame.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/board/assistant-frame.ts"], outfile: "dist/board-assistant-frame.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/settings-return-entry.ts"], outfile: "dist/settings-return-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/account.ts"], outfile: "dist/account-client.js" },
  {
    ...DEFAULT_BROWSER,
    entryPoints: ["src/browser/appearance-entry.ts"],
    target: "es2022",
    legalComments: "none",
    outfile: "dist/appearance-client.js",
  },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/upgrade-opening.ts"], outfile: "dist/upgrade-opening-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/owner-unavailable-copy.ts"], outfile: "dist/owner-unavailable-copy-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/settings-update.ts"], outfile: "dist/settings-update-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/runtime-panel.ts"], outfile: "dist/runtime-panel-client.js" },
  { ...DEFAULT_BROWSER, entryPoints: ["src/browser/settings-running.ts"], outfile: "dist/settings-running-client.js" },
  {
    ...DEFAULT_BROWSER,
    entryPoints: ["src/browser/onboarding-recovery-primitives.ts"],
    target: "es2022",
    legalComments: "none",
    outfile: "dist/onboarding-recovery-primitives.js",
  },
  {
    ...DEFAULT_BROWSER,
    entryPoints: ["src/browser/language-entry.ts"],
    target: "es2022",
    outfile: "dist/language-client.js",
  },
];

// The shell already loads mainline before workbench. Let esbuild find shared modules once, then
// keep the two existing classic-script assets and their loading order (including framed workbenches).
async function buildWorkbenchPair() {
  const result = await build({ ...DEFAULT_BROWSER, entryPoints: {
    mainline: "src/browser/mainline-entry.ts", home: "src/browser/project-home.ts",
  }, outdir: "dist", format: "esm", splitting: true, chunkNames: "shared", target: "es2022", write: false, metafile: true });
  const sources = new Map(result.outputFiles.map(file => [file.path.split("/").at(-1), file.text]));
  const exports = result.metafile.outputs["dist/shared.js"].exports;
  async function wrap(entry, globalName) {
    const first = entry === "mainline";
    const wrapped = await build({ ...DEFAULT_BROWSER, target: "es2022", write: false, globalName,
      stdin: { contents: `export * from "./${entry}.js";` + (first ? 'export * as shared from "./shared.js";' : "") },
      plugins: [{ name: "workbench-pair", setup(builder) {
        builder.onResolve({ filter: /^\.\/(home|mainline|shared)\.js$/ }, ({ path }) => ({ path: path.slice(2), namespace: "pair" }));
        builder.onLoad({ filter: /.*/, namespace: "pair" }, ({ path }) => ({
          contents: path === "shared.js" && !first
            ? exports.map(name => `export const ${name} = globalThis.molisWorkMainline.shared.${name};`).join("\n")
            : sources.get(path),
        }));
      } }],
    });
    return wrapped.outputFiles[0].text;
  }
  const mainline = await wrap("mainline", "molisWorkMainline");
  writeFileSync(new URL("../dist/mainline-client.js", import.meta.url), mainline);
  return wrap("home", "molisWorkHomeView");
}

// Phase 1: build all browser bundles + in-memory composite bundles concurrently in one esbuild service.
const [, frameResult, homeResult, subtaskResult] = await Promise.all([
  Promise.all(BROWSER_BUNDLES.map((options) => build(options))),
  build({
    ...DEFAULT_BROWSER,
    entryPoints: ["src/browser/plugin-frame/entry.ts"],
    outfile: "dist/plugin-frame-client.js",
    write: false,
  }),
  buildWorkbenchPair(),
  build({
    ...DEFAULT_BROWSER,
    entryPoints: ["src/browser/assistant-subtasks.ts"],
    globalName: "molisAssistantSubtasks",
    target: "es2022",
    legalComments: "none",
    write: false,
  }),
]);

// Phase 2: import compiled dist modules AFTER all browser bundles exist on disk (`readFileSync` dependencies).
const [
  { workbenchClientSource },
  { assistantSubtasksClient },
  { ACCOUNT_CLIENT_SCRIPT },
  { capabilitiesClientSource },
] = await Promise.all([
  import("../dist/page-assets.js"),
  import("../dist/assistant-subtasks-client.js"),
  import("../dist/scripts/account.js"),
  import("../dist/scripts/capabilities-client.js"),
]);

// Phase 3: compact client scripts and assemble dist/workbench-client.js keeping UI_REQUEST_CLIENT_SCRIPT byte-for-byte first.
const [frame] = frameResult.outputFiles;
writeFileSync(frame.path, compactClientScript(frame.text));
const kit = new URL("../dist/kit-client.js", import.meta.url);
writeFileSync(kit, compactClientScript(readFileSync(kit, "utf8")));
writeFileSync(new URL("../dist/capabilities-client.js", import.meta.url), compactClientScript(capabilitiesClientSource()));
const workRecords = new URL("../dist/work-records-client.js", import.meta.url);
writeFileSync(workRecords, compactClientScript(readFileSync(workRecords, "utf8")));
const sessions = new URL("../dist/sessions-client.js", import.meta.url);
writeFileSync(sessions, compactClientScript(readFileSync(sessions, "utf8")));
const mainline = new URL("../dist/mainline-client.js", import.meta.url);
writeFileSync(mainline, compactClientScript(readFileSync(mainline, "utf8")));

const source = workbenchClientSource();
if (!source.startsWith(UI_REQUEST_CLIENT_SCRIPT)) throw new Error("Workbench request bootstrap must be first");
const home = homeResult;
const body = compactClientScript(source.slice(UI_REQUEST_CLIENT_SCRIPT.length));
writeFileSync(
  new URL("../dist/workbench-client.js", import.meta.url),
  UI_REQUEST_CLIENT_SCRIPT + home + body + compactClientScript(ACCOUNT_CLIENT_SCRIPT),
);

const subtask = subtaskResult.outputFiles[0].text;
writeFileSync(
  new URL("../dist/assistant-subtasks-bundle.js", import.meta.url),
  compactClientScript(assistantSubtasksClient(subtask)),
);
