import { imagesTestClient } from "./fixtures/images-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ImagesService, imagesManifest, handleImagesRoute, IMAGES_CLIENT_FACTORY_SCRIPT, imagesUiContribution } from "@molis-ai/molis-work-plugin-images";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PERSONAL_PLUGIN_IDS, pluginMarketCards, railEntries } from "@molis-ai/molis-work-app-workbench";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";

test("图片插件通过Manifest进入个人导航和市场，客户端可解析", () => {
  assert.equal(parsePluginManifest(imagesManifest).plugin_id, "io.molis.work.images");
  assert.ok(PERSONAL_PLUGIN_IDS.includes("images"));
  assert.equal(pluginMarketCards().find((card) => card.id === "images")?.personal, true);
  assert.equal(railEntries(["images"])[0]?.label, "图片");
  assert.equal(imagesUiContribution.descriptor.navigation_id, "images");
  assert.doesNotThrow(() => new Function(`return (${IMAGES_CLIENT_FACTORY_SCRIPT});`));
});

test("HTTP route 使用Host项目，拒绝伪造project_id，图片下载同样隔离", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "images-routes-"));
  const keys = new Map<string, string>();
  const service = new ImagesService({homeDirectory, secrets: {get: (k) => keys.get(k) ?? null, put: (k, v) => {keys.set(k, v);}, delete: (k) => {keys.delete(k);}}, generate: async () => [{bytes: Buffer.from(PNG, "base64"), mime: "image/png"}]});
  try {
    const route = (input: Parameters<typeof handleImagesRoute>[1]) => handleImagesRoute(imagesTestClient(service, input.projectId), input);
    const connection = service.saveConnection({name:"受控本地服务", api_format:"openai-images",base_url:"http://127.0.0.1:9999/v1",model:"fixture-image"});
    assert.deepEqual((await route( {method:"GET",pathname:"/api/images/jobs",body:{},projectId:""})).body, {jobs:[]});
    await assert.rejects(() => route( {method:"POST",pathname:"/api/images/jobs",body:{project_id:"forged"},projectId:""}), /项目/);
    const response = await route( {method:"POST",pathname:"/api/images/jobs",body:{request_id:"route-test",connection_id:connection.id,prompt:"测试图",project_id:"project-a"},projectId:"project-a"});
    const {job} = response.body as {job: {id:string}};
    for (let n = 0; n < 100 && service.getJob("project-a", job.id).status === "running"; n++) await new Promise((r) => setTimeout(r, 10));
    const completed = service.getJob("project-a", job.id);
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.project_id, "project-a");
    await assert.rejects(() => route( {method:"GET",pathname:`/api/images/jobs/${job.id}`,body:{},projectId:"project-b"}));
    const path = `/api/images/jobs/${job.id}/images/${completed.images[0]!.id}`;
    await assert.rejects(() => route( {method:"GET",pathname:path,body:{},projectId:"project-b"}));
    const image = (await route( {method:"GET",pathname:path,body:{},projectId:"project-a"})).image;
    assert.equal(image?.mime,"image/png");
    assert.deepEqual(Buffer.from(image!.bytes), Buffer.from(PNG,"base64"));
    assert.equal((await route( {method:"GET",pathname:path+"/unknown",body:{},projectId:"project-a"})).status,404);
    const next = service.start("project-a", {request_id:"delete-running",connection_id:connection.id,prompt:"下一张"});
    await assert.rejects(() => route( {method:"DELETE",pathname:`/api/images/jobs/${next.id}`,body:{},projectId:"project-a"}), /先停止生成/);
    service.cancel("project-a", next.id);
    assert.equal((await route( {method:"DELETE",pathname:`/api/images/jobs/${next.id}`,body:{},projectId:"project-a"})).status,200);
    assert.equal((await route( {method:"DELETE",pathname:`/api/images/connections/${connection.id}`,body:{},projectId:"project-a"})).status,200);
    assert.equal(service.getJob("project-a", job.id).status,"succeeded");
    assert.throws(() => service.start("project-a", {request_id:"after-connection-delete",connection_id:connection.id,prompt:"新图"}), /找不到所选生图服务/);
    await assert.rejects(() => route( {method:"DELETE",pathname:`/api/images/jobs/${job.id}`,body:{},projectId:"project-b"}), /找不到/);
    assert.equal((await route( {method:"DELETE",pathname:`/api/images/jobs/${job.id}`,body:{},projectId:"project-a"})).status,200);
    assert.equal(existsSync(join(homeDirectory,"images","assets",completed.images[0]!.filename)),false);
    assert.throws(() => service.getJob("project-a", job.id), /找不到/);
  } finally {await service.close();await rm(homeDirectory,{recursive:true,force:true});}
});
