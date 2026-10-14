import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { transformSync } from "esbuild";
import { createLocalWebAssets } from "@molis-ai/molis-work-app-local-host";

const script = `
function keepName(value) {
  // The note stays in the source and is not a second program.
  return value + 1;
}
keepName(1);
`;
const sheet = `
/* A child combinator keeps both sides and the gap. */
.a > .b { color: red; }
`;

const assets = createLocalWebAssets({
  ptyClientFilePath: () => "/missing-pty-client.js",
  renderer: {
    renderMolisWorkWorkbenchClientScript: () => script,
    renderMolisWorkWorkbenchStylesheet: () => sheet,
    renderMolisWorkArrivalStylesheet: () => "",
    renderMolisWorkSettingsStylesheet: () => "",
  },
});

function served(pathname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (!assets.serveWorkbenchAsset(request, response, pathname)) response.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("no port")); return; }
      fetch(`http://127.0.0.1:${address.port}${pathname}`).then(async response => {
        const body = await response.text();
        server.close(() => resolve(body));
      }).catch(error => server.close(() => reject(error)));
    });
  });
}

const program = (source: string) => transformSync(source, { loader: "js", minify: true }).code;

test("the host serves the same script, with the same names, and leaves a child combinator alone", async () => {
  const sentScript = await served("/assets/molis-work-workbench.js");
  const sentSheet = await served("/assets/molis-work-workbench.css");
  assert.equal(program(sentScript), program(script));
  assert.match(sentScript, /function keepName\(/);
  assert.match(sentSheet, /\.a > \.b/);
  assert.doesNotMatch(sentSheet, /\.a>\.b/);
});
