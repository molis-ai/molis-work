import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
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

test("HTTP route 使用Host项目，忽略伪造project_id，图片下载同样隔离", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "images-routes-"));
  const keys = new Map<string, string>();
  const service = new ImagesService({homeDirectory, secrets: {get: (k) => keys.get(k) ?? null, put: (k, v) => {keys.set(k, v);}, delete: (k) => {keys.delete(k);}}, fetch: async () => new Response(JSON.stringify({data: [{b64_json: PNG}]}), {headers: {"content-type": "application/json"}})});
  try {
    const connection = service.saveConnection({name:"受控本地服务", api_format:"openai-images",base_url:"http://127.0.0.1:9999/v1",model:"fixture-image"});
    assert.deepEqual(handleImagesRoute(service, {method:"GET",pathname:"/api/images/jobs",body:{},projectId:""}).body, {jobs:[]});
    assert.throws(() => handleImagesRoute(service, {method:"POST",pathname:"/api/images/jobs",body:{project_id:"forged"},projectId:""}), /选择项目/);
    const response = handleImagesRoute(service, {method:"POST",pathname:"/api/images/jobs",body:{request_id:"route-test",connection_id:connection.id,prompt:"测试图",project_id:"other-project"},projectId:"project-a"});
    const {job} = response.body as {job: {id:string}};
    for (let n = 0; n < 100 && service.getJob("project-a", job.id).status === "running"; n++) await new Promise((r) => setTimeout(r, 10));
    const completed = service.getJob("project-a", job.id);
    assert.equal(completed.status, "succeeded");
    assert.equal(completed.project_id, "project-a");
    assert.throws(() => handleImagesRoute(service, {method:"GET",pathname:`/api/images/jobs/${job.id}`,body:{},projectId:"project-b"}));
    const path = `/api/images/jobs/${job.id}/images/${completed.images[0]!.id}`;
    assert.throws(() => handleImagesRoute(service, {method:"GET",pathname:path,body:{},projectId:"project-b"}));
    const image = handleImagesRoute(service, {method:"GET",pathname:path,body:{},projectId:"project-a"}).image;
    assert.equal(image?.mime,"image/png");
    assert.deepEqual(Buffer.from(image!.bytes), Buffer.from(PNG,"base64"));
    assert.equal(handleImagesRoute(service, {method:"GET",pathname:path+"/unknown",body:{},projectId:"project-a"}).status,404);
  } finally {await service.close();await rm(homeDirectory,{recursive:true,force:true});}
});
