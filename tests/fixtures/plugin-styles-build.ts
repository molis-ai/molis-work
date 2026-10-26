import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const BUDGET = "tooling/gates/plugin-styles.json";
const workbenchEntry = import.meta.resolve("@molis-ai/molis-work-app-workbench");
export const PREFIX_SHEET = ".probe-private{opacity:1}.probe-shared{color:red}.legacy-card{display:grid}";

// Only the registered data and Goals' empty style constants are synthetic. Both splitOf/on-demand selection and the gate's
// counting splitter come from this checkout's public built workbench entry; no copy of either production algorithm lives here.
export function pluginStylesBuildFixture(parent: string) {
  const root = mkdtempSync(path.join(parent, "prefix-build-"));
  const put = (file: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates",
    "-c", "user.email=gates@example.invalid", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "-m", message); };
  const writeBudget = (plugins: Record<string, number>, prefixes: Record<string, string[]> = {}) =>
    put(BUDGET, `${JSON.stringify({ note: "fixture", plugins, prefixes }, null, 2)}\n`);
  const writeBuild = ({ prefixes = [], stylesheet = PREFIX_SHEET, sharedClasses = ["probe-shared"] }:
    { prefixes?: string[]; stylesheet?: string; sharedClasses?: string[] } = {}) => {
    const pack = { project_plugin_id: "probe", clientFactory: "() => {}", stylesheet,
      stylesheetShared: sharedClasses, stylesheetPrefixes: prefixes };
    put("apps/workbench/dist/plugin-workbench.js", `import { pluginOnDemandStylesheet as onDemand } from ${JSON.stringify(workbenchEntry)};\n`
      + `export const BUILTIN_PLUGIN_WORKBENCH = ${JSON.stringify([pack])};\n`
      + "export const pluginOnDemandStylesheet = id => onDemand(id, BUILTIN_PLUGIN_WORKBENCH);\n");
  };
  put("package.json", '{"type":"module","private":true}\n');
  put("apps/workbench/dist/plugin-styles.js", `export { splitPluginStylesheet } from ${JSON.stringify(workbenchEntry)};\n`);
  put("plugins/native/goals/dist/index.js", 'export const GOALS_DOCUMENT_STYLES = "", TRASH_GOAL_STYLES = "", PLANNING_SETTINGS_STYLES = "";\n');
  writeBuild();
  writeBudget({ probe: 1 });
  git("init", "-q", "-b", "main");
  commit("initial shared remainder");
  return { root, git, commit, writeBuild, writeBudget,
    budgetText: () => readFileSync(path.join(root, BUDGET), "utf8"),
    cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
