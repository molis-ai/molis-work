// Bundles the parts of the Coding page that only unit tests mount alone with fake ports into dist/*-bundle.js with esbuild. The page
// (workbench-bundle.js), the settings page and the four parts the package exports are bundled by the esbuild steps of package.json "build".
// Each bundle is a function expression `(ports) => …` over the part's factory in src/browser/<module>.ts.
import { build } from "esbuild";

/**
 * The parts tests read from dist/ (tests/coding-state-rings.e2e, ...): each is a factory `(ports) => …` over src/browser/<module>.ts's
 * `<create>`. The page itself is one bundle that holds these modules too.
 */
const pieces = [
  { out: "characters-bundle.js", module: "characters", create: "characterChoice" },
  { out: "actions-bundle.js", module: "actions", create: "actionsClient" },
  { out: "usage-meter-bundle.js", module: "usage-meter", create: "usageMeter" },
  { out: "subagents-bundle.js", module: "subagents", create: "subagentGroups" },
  { out: "writers-bundle.js", module: "writers", create: "writerDirectories" },
  { out: "writer-integration-bundle.js", module: "writer-integration", create: "writerIntegration" },
  { out: "subagent-cards-bundle.js", module: "subagent-cards", create: "subagentCards" },
  { out: "commands-bundle.js", module: "commands", create: "commandsClient" },
  { out: "plans-bundle.js", module: "plans", create: "plansClient" },
  { out: "changeset-bundle.js", module: "changeset", create: "changesetClient" },
  { out: "cooperation-bundle.js", module: "cooperation", create: "cooperationClient" },
  { out: "composer-model-bundle.js", module: "composer-model", create: "composerModels" },
];

const shared = { bundle: true, format: "iife", platform: "browser", minify: true, charset: "utf8", logLevel: "warning" };

await Promise.all(pieces.map(({ out, module, create }) => build({
  ...shared,
  stdin: { contents: `export { ${create} as create } from "./${module}.js";`, resolveDir: "src/browser", loader: "ts" },
  globalName: "piece", banner: { js: "(ports) => {" }, footer: { js: "return piece.create(ports)}" },
  outfile: `dist/${out}`,
})));
