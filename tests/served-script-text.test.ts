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

function served(pathname: string, source = script): Promise<{ text: string; bytes: number; type: string | null }> {
  const assets = createLocalWebAssets({
    ptyClientFilePath: () => "/missing-pty-client.js",
    renderer: {
      renderMolisWorkWorkbenchClientScript: () => source,
      renderMolisWorkWorkbenchStylesheet: () => "",
      renderMolisWorkArrivalStylesheet: () => "",
      renderMolisWorkSettingsStylesheet: () => "",
    },
  });

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
  assert.equal(Function(`${sent.text}; return label();`)(), "暂时处理不了，请稍后重试 · 第 1 步");
  assert.doesNotMatch(sent.text, /\\u[0-9a-fA-F]{4}/u, "no character is escaped");
  assert.doesNotMatch(sent.text, /这句注释不发/u, "comments are still not sent");
  assert.equal(program(sent.text), program(script));
  assert.equal(sent.bytes, Buffer.byteLength(sent.text));
});

test("RING-06 served compaction keeps template text, return newlines and side-effect order", async () => {
  const source = `(() => {
    function stopped() { return /* a newline is significant
      */ host.effects.push("unreachable"); }
    function step(value) { host.effects.push(value); return value; }
    host.text = \`first \${step("one")}
      second \${\`nested \${step("two")}\`}
    \`;
    host.matches = /a b\\/c/.test("a b/c");
    host.stopped = stopped();
    if (host.enabled) { step("enabled"); } else { step("disabled"); }
  })();`;
  const sent = await served("/assets/molis-work-workbench.js", source);
  for (const enabled of [true, false]) {
    const host = { enabled, effects: [] };
    Function("host", sent.text)(host);
    assert.deepEqual(host, {
      enabled, effects: ["one", "two", enabled ? "enabled" : "disabled"],
      text: "first one\n      second nested two\n    ", matches: true, stopped: undefined,
    });
  }
  assert.ok(sent.bytes < Buffer.byteLength(source));
});

// Top-level and global names are what other scripts and pages read, so they stay; names local to a function may shorten
// (user decision 2026-10-15, which replaced 「binding names remain inspectable」).
test("RING-06 served compaction keeps top-level and global names and may shorten local ones", async () => {
  const source = `var MolisWorkPagesEditor = (() => {
    function mountSomething(longParameterName) { const localResult = longParameterName + 1; return localResult; }
    return { mountSomething };
  })();
  function sharedHelper(firstArgument) { return firstArgument * 2; }
  const topSetting = 3;`;
  const sent = await served("/assets/molis-work-workbench.js", source);
  const scope = Function(`${sent.text}; return { MolisWorkPagesEditor, sharedHelper, topSetting };`)();
  assert.equal(scope.MolisWorkPagesEditor.mountSomething(1), 2, "a property keeps its name");
  assert.equal(scope.sharedHelper(4), 8);
  assert.equal(scope.topSetting, 3);
  assert.match(sent.text, /var MolisWorkPagesEditor=/u);
  assert.match(sent.text, /function sharedHelper\(/u);
  assert.doesNotMatch(sent.text, /longParameterName|localResult|firstArgument/u, "local names are shortened");

  const editor = await served("/assets/molis-work-pages-editor.js");
  assert.match(editor.text, /^(?:"use strict";)?var MolisWorkPagesEditor=/u, "the Pages editor's global, as the Pages client reads it");
});

test("RING-06 an unparseable served script keeps its exact content", async () => {
  const source = "  /* preserve this */\nconst broken = ;\n  ";
  const sent = await served("/assets/molis-work-workbench.js", source);
  assert.equal(sent.text, source);
});
