import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";

test("Coding formal routes preserve drafts and isolate projects across server restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "coding-product-http-"));
  const token = "coding-product-control-token-0123456789abcdef";
  let server: ReturnType<typeof createMolisWorkWebServer>;
  let origin = "";
  async function start() {
    server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    origin = `http://127.0.0.1:${address.port}`;
  }
  async function request(url: string, method = "GET", body?: unknown, authorized = true) {
    const response = await fetch(origin + url, { method, headers: { origin, "content-type": "application/json",
      "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? {"x-molis-work-control-token":token} : {}) },
      ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    return {status:response.status, body:await response.json()};
  }
  const close = () => new Promise<void>(resolve => server.close(() => resolve()));
  try {
    new Function('return (' + CODING_CLIENT_FACTORY_SCRIPT + ')');
    await start();
    const projects = [];
    for (const name of ["A","B"]) {
      const created = await request('/api/settings/projects','POST',{display_name:name,user_confirmed:true});
      assert.equal(created.status,201);
      projects.push(created.body.project.project_id);
    }
    const plugin = (project: string) => `/projects/${project}/api/plugins/io.molis.work.coding`;
    assert.equal((await request(plugin(projects[0])+'/state')).status,404);
    for(const project of projects) assert.equal((await request(`/api/settings/projects/${project}/plugins`,'POST',{plugin_id:'coding'})).status,200);
    const a=plugin(projects[0]),b=plugin(projects[1]);
    assert.equal((await request(a+'/sessions','POST',{title:'denied'},false)).status,403);
    const created=await request(a+'/sessions','POST',{title:'待检查的任务'});
    assert.equal(created.status,200);
    const session=created.body.session.session_id;
    assert.equal(created.body.session.state,'idle');
    const draft='保留需求、证据与未解决问题\n不要假装已经执行。';
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{draft})).status,200);
    assert.equal((await request(b+'/sessions/'+session)).status,404);
    assert.equal((await request(b+'/sessions/'+session,'PATCH',{draft:'wrong project'})).status,404);
    assert.equal((await request(a+'/sessions/'+session+'/runs','POST',{task:'read',intent:'discuss',workspace_id:'invented'})).status,400);
    assert.equal((await request(a+'/sessions/'+session)).body.session.runtime_session_id,null);
    const state=await request(a+'/state');assert.equal(state.status,200);assert.deepEqual(state.body.workspaces,[]);
    await close();await start();
    const reopened=await request(a+'/sessions/'+session);
    assert.equal(reopened.status,200);assert.equal(reopened.body.draft,draft);assert.deepEqual(reopened.body.runs,[]);
    assert.equal((await request(a+'/sessions/'+session,'PATCH',{title:'继续检查'})).status,200);
    assert.equal((await request(a+'/state')).body.sessions[0].title,'继续检查');
  } finally {
    if(server!?.listening) await close();
    await rm(root,{recursive:true,force:true});
  }
});
