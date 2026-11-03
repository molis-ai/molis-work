// CDP consumes one expression and two function declarations. Their complete implementations are checked DOM TypeScript;
// the wrappers keep esbuild's module variable inside the invoked function, without publishing anything on the page.
import { build } from "esbuild";

const programs = [
  { entry: "capture", file: "surface-capture.js", banner: "(() => {", footer: "return surfaceProgram.program();})()" },
  { entry: "read", file: "surface-read.js", banner: "function() {", footer: "return surfaceProgram.program.call(this)}" },
  { entry: "resolve", file: "surface-resolve.js", banner: "function(index, currentDocument) {", footer: "return surfaceProgram.program.call(this,index,currentDocument)}" },
];

await Promise.all(programs.map(({ entry, file, banner, footer }) => build({
  bundle: true, format: "iife", platform: "browser", minify: true, charset: "utf8", logLevel: "warning",
  stdin: { contents: `export { ${entry} as program } from "./surface-nodes.js";`, resolveDir: "src/browser/programs", loader: "ts" },
  globalName: "surfaceProgram", banner: { js: banner }, footer: { js: footer }, outfile: `dist/browser/${file}`,
})));
