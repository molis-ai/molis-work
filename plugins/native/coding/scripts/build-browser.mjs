// Bundles the Coding page's browser code (src/browser/, type-checked by tsconfig.browser.json) into dist/*.js with esbuild.
// Each bundle is a function expression the Host (or Coding's page client) calls, so the build wraps esbuild's output in the
// factory's parameters and returns what the factory hands back (the banner and footer below).
import { build } from "esbuild";

/** A page piece that takes `ports` and hands back what it mounted: src/browser/<module>.ts exports `<create>(ports)`. */
const pieces = [
  { out: "steps-bundle.js", module: "steps", create: "stepReports" },
  { out: "characters-bundle.js", module: "characters", create: "characterChoice" },
  { out: "actions-bundle.js", module: "actions", create: "actionsClient" },
  { out: "usage-meter-bundle.js", module: "usage-meter", create: "usageMeter" },
];

const shared = { bundle: true, format: "iife", platform: "browser", minify: true, charset: "utf8", logLevel: "warning" };

await Promise.all([
  build({ ...shared, entryPoints: ["src/browser/draft-factory.ts"], banner: { js: "(ports, draft) => {" }, footer: { js: "return draft}" }, outfile: "dist/draft-bundle.js" }),
  build({ ...shared, entryPoints: ["src/browser/workbench-factory.ts"], banner: { js: "(host, coding) => {" }, footer: { js: "}" }, outfile: "dist/workbench-bundle.js" }),
  ...pieces.map(({ out, module, create }) => build({
    ...shared,
    stdin: { contents: `import { ${create} } from "./${module}.js"; piece = ${create}(ports);`, resolveDir: "src/browser", loader: "ts" },
    banner: { js: "(ports) => {let piece;" }, footer: { js: "return piece}" },
    outfile: `dist/${out}`,
  })),
]);
