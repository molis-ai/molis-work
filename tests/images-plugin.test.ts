import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { imagesManifest, IMAGES_CLIENT_FACTORY_SCRIPT, imagesUiContribution } from "@molis-ai/molis-work-plugin-images";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { pluginMarketCards, railEntries } from "@molis-ai/molis-work-app-workbench";
import { SHELF_ADMIT_ACTION } from "@molis-ai/molis-work-module-shelf/contract";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { IMAGE_PNG, imageReply } from "./fixtures/images-runtime.js";
import type { ImageJob } from "@molis-ai/molis-work-plugin-images/contract";
import { PERSONAL_PLUGIN_IDS, builtinMarketDirectory } from "@molis-ai/molis-work-app-local-host";

test("图片插件通过Manifest进入个人导航和市场，客户端可解析", () => {
  assert.equal(parsePluginManifest(imagesManifest).plugin_id, "io.molis.work.images");
  assert.ok(PERSONAL_PLUGIN_IDS.includes("images"));
  assert.equal(pluginMarketCards({}, builtinMarketDirectory()).find((card) => card.id === "images")?.personal, true);
  assert.equal(railEntries(["images"]).find(entry => entry.id === "images")?.label, "图片");
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
  // RAC-1881, RAC-1882: the saved name is cut at 80 whole characters. Half of one makes the Content-Disposition name unencodable, so the download used to fail with a 500.
  const named = async (asked: string) => {
    const reply = await f.request(first + imagePath + "?download=1&name=" + encodeURIComponent(asked)), header = reply.headers.get("content-disposition");
    await reply.arrayBuffer();
    return { status: reply.status, filename: header === null ? null : decodeURIComponent(header.slice(header.indexOf("''") + 2)) };
  };
  const wide = (count: number) => "😀".repeat(count);
  for (const c of [
    { rac: "RAC-1881", name: "79 letters and an emoji", asked: "a".repeat(79) + wide(1), filename: "a".repeat(79) + wide(1) + ".png" },
    { rac: "RAC-1881", name: "80 emoji", asked: wide(80), filename: wide(80) + ".png" },
    { rac: "RAC-1881", name: "81 emoji are cut to 80", asked: wide(81), filename: wide(80) + ".png" },
    { rac: "RAC-1882", name: "a name that fits", asked: "留一张", filename: "留一张.png" },
    { rac: "RAC-1882", name: "a name that already ends in the extension", asked: "pic.PNG", filename: "pic.PNG" },
    { rac: "RAC-1882", name: "forbidden characters become spaces", asked: "a/b:c", filename: "a b c.png" },
  ]) await t.test(`${c.rac} ${c.name}`, async () => assert.deepEqual(await named(c.asked), { status: 200, filename: c.filename }));
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
