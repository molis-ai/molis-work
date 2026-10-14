import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { transformSync } from "esbuild";
import { createLocalWebAssets } from "@molis-ai/molis-work-app-local-host";

// What the workbench script says to people is sent as written. The asset is UTF-8, so an escape would only double the bytes.
const script = `
function label() {
  // 这句注释不发。
  return "暂时处理不了，请稍后重试" + " · " + \`第 \${1} 步\`;
}
label();
`;

const assets = createLocalWebAssets({
  ptyClientFilePath: () => "/missing-pty-client.js",
  renderer: {
    renderMolisWorkWorkbenchClientScript: () => script,
    renderMolisWorkWorkbenchStylesheet: () => "",
    renderMolisWorkArrivalStylesheet: () => "",
    renderMolisWorkSettingsStylesheet: () => "",
  },
});

function served(pathname: string): Promise<{ text: string; bytes: number; type: string | null }> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (!assets.serveWorkbenchAsset(request, response, pathname)) response.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") { server.close(); reject(new Error("no port")); return; }
      fetch(`http://127.0.0.1:${address.port}${pathname}`).then(async response => {
        const body = new Uint8Array(await response.arrayBuffer());
        const type = response.headers.get("content-type");
        server.close(() => resolve({ text: new TextDecoder().decode(body), bytes: body.byteLength, type }));
      }).catch(error => server.close(() => reject(error)));
    });
  });
}

const program = (source: string) => transformSync(source, { loader: "js", minify: true }).code;

test("the served workbench script keeps Chinese text as UTF-8, not \\u escapes, and is the same program", async () => {
  const sent = await served("/assets/molis-work-workbench.js");
  assert.match(sent.type ?? "", /charset=utf-8/u);
  assert.match(sent.text, /暂时处理不了，请稍后重试/u);
  assert.match(sent.text, /第 \$\{1\} 步/u);
  assert.doesNotMatch(sent.text, /\\u[0-9a-fA-F]{4}/u, "no character is escaped");
  assert.doesNotMatch(sent.text, /这句注释不发/u, "comments are still not sent");
  assert.equal(program(sent.text), program(script));
  assert.equal(sent.bytes, Buffer.byteLength(sent.text));
});
