import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { imagesManifest, IMAGES_CLIENT_FACTORY_SCRIPT, imagesUiContribution } from "@molis-ai/molis-work-plugin-images";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { PERSONAL_PLUGIN_IDS, pluginMarketCards, railEntries } from "@molis-ai/molis-work-app-workbench";
import { SHELF_ADMIT_ACTION } from "@molis-ai/molis-work-contracts/modules/shelf";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { IMAGE_PNG, imageReply } from "./fixtures/images-runtime.js";
import type { ImageJob } from "@molis-ai/molis-work-plugin-images/contract";

test("图片插件通过Manifest进入个人导航和市场，客户端可解析", () => {
  assert.equal(parsePluginManifest(imagesManifest).plugin_id, "io.molis.work.images");
  assert.ok(PERSONAL_PLUGIN_IDS.includes("images"));
  assert.equal(pluginMarketCards().find((card) => card.id === "images")?.personal, true);
  assert.equal(railEntries(["images"])[0]?.label, "图片");
  assert.equal(imagesUiContribution.descriptor.navigation_id, "images");
  assert.doesNotThrow(() => new Function(`return (${IMAGES_CLIENT_FACTORY_SCRIPT});`));
});


test("W5-01-IMGPORT-02 HTTP Runtime binds project identity, reads bytes and saves the same image to Shelf", async t => {
  const f = await serveHomeRuntime(t), one = await f.project("Images one"), two = await f.project("Images two");
  const server = createServer(async (request, response) => { for await (const _chunk of request) { /* drain input */ } imageReply(response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const root = "/api/plugins/io.molis.work.images", first = `/projects/${one.project_id}${root}`, second = `/projects/${two.project_id}${root}`;
  const post = (path: string, body: object) => f.request(path, { method: "POST", body });
  const saved = await post(root + "/connections", { name: "Runtime HTTP", api_format: "openai-images", base_url: `http://127.0.0.1:${address.port}/v1`, model: "fixture" });
  assert.equal(saved.status, 200, await saved.clone().text());
  const { connection } = await saved.json();
  const forged = await post(first + "/jobs", { request_id: "forged", connection_id: connection.id, prompt: "forged", project_id: two.project_id });
  assert.equal(forged.status, 400, await forged.clone().text());
  assert.equal((await post(first + "/jobs", { prompt: "x".repeat(170_000) })).status, 413);
  const accepted = await post(first + "/jobs", { request_id: "real", connection_id: connection.id, prompt: "HTTP image" });
  assert.equal(accepted.status, 202, await accepted.clone().text());
  let job: ImageJob = (await accepted.json()).job;
  for (let attempt = 0; attempt < 100 && job.status === "running"; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20)); job = (await (await f.request(first + `/jobs/${job.id}`)).json()).job;
  }
  assert.equal(job.status, "succeeded"); assert.equal(job.project_id, one.project_id);
  const imagePath = `/jobs/${job.id}/images/${job.images[0]!.id}`;
  assert.equal((await f.request(second + imagePath)).status, 404);
  const image = await f.request(first + imagePath);
  assert.equal(image.status, 200); assert.match(image.headers.get("content-type") ?? "", /image\/png/);
  assert.match(image.headers.get("content-disposition") ?? "", /^inline;/);
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), IMAGE_PNG);
  const download = await f.request(first + imagePath + "?download=1&name=retained.png");
  assert.match(download.headers.get("content-disposition") ?? "", /^attachment;.*retained\.png/);
  // IMAGES-SHELF-01: the real Shelf action receives the copy through the shared action contract.
  assert.equal(shelfActions.admit, SHELF_ADMIT_ACTION);
  const kept = await post(first + imagePath + "/shelf", { filename: "留一张.png" });
  assert.equal(kept.status, 200, await kept.clone().text());
  const { item } = await kept.json(); assert.equal(item.name, "留一张.png"); assert.equal(item.mime, "image/png");
  assert.equal((await post(second + imagePath + "/shelf", {})).status, 404);
  assert.equal((await f.request(second + `/jobs/${job.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await f.request(first + `/jobs/${job.id}`, { method: "DELETE" })).status, 200);
  assert.equal(existsSync(join(f.home, "images", "assets", job.images[0]!.filename)), false);
  assert.equal((await f.request(first + `/jobs/${job.id}`)).status, 404);
});
