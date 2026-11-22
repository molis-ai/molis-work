// Bundles the parts of the Goals page that only unit tests mount alone with fake ports into dist/*-bundle.js with esbuild. The page
// itself (dist/goals-page-client.js) is bundled by the esbuild step of package.json "build" and holds these modules too.
// Each bundle is a function expression `(ports) => …` over the part's factory in src/browser/<module>.ts.
import { build } from "esbuild";

/** The parts tests read from dist/ (tests/goals-client-request, tests/goals-document.e2e, tests/plugin-words-owned). */
const pieces = [
  { out: "dialogs-bundle.js", module: "dialogs", create: "dialogsClient" },
  { out: "lifecycle-bundle.js", module: "lifecycle", create: "lifecycleClient" },
  { out: "document-bundle.js", module: "document", create: "documentClient" },
  { out: "event-document-bundle.js", module: "event-document", create: "eventDocumentClient" },
  { out: "momentum-bundle.js", module: "momentum", create: "momentumClient" },
  { out: "proposal-bundle.js", module: "proposal", create: "proposalClient" },
  { out: "relation-bundle.js", module: "relation", create: "relationClient" },
];

const shared = { bundle: true, format: "iife", platform: "browser", minify: true, charset: "utf8", logLevel: "warning" };

await Promise.all(pieces.map(({ out, module, create }) => build({
  ...shared,
  stdin: { contents: `export { ${create} as create } from "./${module}.js";`, resolveDir: "src/browser", loader: "ts" },
  globalName: "piece", banner: { js: "(ports) => {" }, footer: { js: "return piece.create(ports)}" },
  outfile: `dist/${out}`,
})));
