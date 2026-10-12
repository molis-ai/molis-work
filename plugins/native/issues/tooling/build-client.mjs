import { writeFile } from "node:fs/promises";
import { transform } from "esbuild";
import { ISSUES_CLIENT_FACTORY_SCRIPT } from "../dist/client.js";
import { ISSUES_STYLES } from "../dist/ui.js";

// Keep the source readable while shipping only the minified factory string.
// esbuild is the workspace's existing browser build tool; no runtime dependency is added.
const assignment = "globalThis.__issueFactory=";
const css = await transform(ISSUES_STYLES, { loader: "css", minify: true, target: "es2022" });
const source = ISSUES_CLIENT_FACTORY_SCRIPT.replace(JSON.stringify(ISSUES_STYLES), JSON.stringify(css.code.trim()));
const result = await transform(`${assignment}${source};`, {
  minify: true, target: "es2022", charset: "utf8", legalComments: "none",
});
if (!result.code.startsWith(assignment) || !result.code.trimEnd().endsWith(";")) {
  throw new Error("Unexpected Issue client build output");
}
const factory = result.code.trimEnd().slice(assignment.length, -1);
await writeFile(new URL("../dist/client.js", import.meta.url),
  `export const ISSUES_CLIENT_FACTORY_SCRIPT = ${JSON.stringify(factory)};\n`);
