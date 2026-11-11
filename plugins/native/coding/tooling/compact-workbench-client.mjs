import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = new URL("../dist/workbench-bundle.js", import.meta.url);
const source = readFileSync(file, "utf8");
const start = "(host) => {\n", end = "}\n";
if (!source.startsWith(start) || !source.endsWith(end)) throw new Error("Expected the Coding Workbench factory wrapper");

const compactor = fileURLToPath(new URL("../../../../scripts/client-literals.mjs", import.meta.url));
const body = execFileSync(process.execPath, [compactor], {
  input: source.slice(start.length, -end.length), encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "inherit"],
});
// The Host consumes a function of its own scoped ports. Only its bundled body is compacted.
writeFileSync(file, start + body + end);
