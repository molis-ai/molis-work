import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installMolisWorkHome } from "@molis-ai/molis-work-app-local-host";

// FSS-59: a real release, from this checkout into a temporary Home, read by a process with nothing but that release. Before the fix both routes answered 404: Local
// Host looked for `../../../packages/design-system/fonts/…`, and a release has no `packages/` (the system fonts come first, so nobody saw it).

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DESIGN_SYSTEM = "node_modules/@molis-ai/molis-work-design-system";

/** What a release's own Local Host answers for these paths, over HTTP; a path it does not serve is the 404 the web server gives. */
const PROBE = `
  import { createHash } from "node:crypto";
  import http from "node:http";
  const { createLocalWebAssets } = await import(process.env.WEB_ASSETS);
  const empty = () => "";
  const assets = createLocalWebAssets({ ptyClientFilePath: () => "", renderer: { renderMolisWorkWorkbenchStylesheet: empty, renderMolisWorkWorkbenchClientScript: empty, renderMolisWorkArrivalStylesheet: empty, renderMolisWorkSettingsStylesheet: empty } });
  const server = http.createServer((request, response) => {
    if (assets.serveWorkbenchAsset(request, response, new URL(request.url, "http://x").pathname)) return;
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const answers = {};
  for (const route of ["/assets/inter-latin-variable.woff2", "/assets/noto-sans-sc-400.woff2"]) {
    const answer = await fetch("http://127.0.0.1:" + server.address().port + route);
    answers[route] = { status: answer.status, type: answer.headers.get("content-type"), sha256: createHash("sha256").update(Buffer.from(await answer.arrayBuffer())).digest("hex") };
  }
  server.close();
  const { BASELINE_SKIN, BASELINE_FONT, FONT_STACK } = await import(process.env.DESIGN_SYSTEM);
  console.log(JSON.stringify({ answers, page: BASELINE_SKIN.light.page, stackFromFile: BASELINE_FONT.tokens.font === FONT_STACK }));
`;

test("FSS-59 in a clean release the baseline files are readable and both offline fonts answer 200", { timeout: 300_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "molis-baseline-release-"));
  try {
    const { release_directory: release } = await installMolisWorkHome({ homeDirectory: path.join(directory, ".molis-work"), sourceDirectory: ROOT, version: "0.1.0-ui-baseline-test" });
    for (const file of ["registry.json", "ui-spec.json", "skins/soft-workbench.json", "fonts/system-sans.json"]) {
      assert.ok((await stat(path.join(release, DESIGN_SYSTEM, "resources", file))).isFile(), file);
    }
    const { stdout } = await exec(process.execPath, ["--input-type=module", "-e", PROBE], {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        WEB_ASSETS: `file://${path.join(release, "node_modules/@molis-ai/molis-work-app-local-host/dist/web-assets.js")}`,
        DESIGN_SYSTEM: `file://${path.join(release, DESIGN_SYSTEM, "dist/index.js")}`,
      },
    });
    const { answers, page, stackFromFile } = JSON.parse(stdout) as { answers: Record<string, { status: number; type: string; sha256: string }>; page: string; stackFromFile: boolean };
    assert.equal(page, "#eef3f7");
    assert.equal(stackFromFile, true);
    for (const [route, answer] of Object.entries(answers)) {
      assert.equal(answer.status, 200, route);
      assert.equal(answer.type, "font/woff2", route);
      const shipped = await readFile(path.join(ROOT, "packages/design-system/fonts", path.basename(route)));
      assert.equal(answer.sha256, createHash("sha256").update(shipped).digest("hex"), route);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
