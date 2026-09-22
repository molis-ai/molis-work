import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
const exec = promisify(execFile);

test("Coding formal worktree preparation requires the original review, grants only the created directory and retains results across restart", async () => {
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "coding-directories-"))), root = path.join(home, "repo"); await mkdir(root);
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const token = "writer-directories-control-0123456789abcdef";
  let server: ReturnType<typeof createMolisWorkWebServer>, origin = "";
  const start = async () => { server = createMolisWorkWebServer({ homeDirectory: home, controlToken: token }); await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve)); const a=server.address(); assert.ok(a&&typeof a==='object'); origin=`http://127.0.0.1:${a.port}`; };
  const close = () => new Promise<void>(resolve => server.close(()=>resolve()));
  const request = async (url: string, method="GET", body?: unknown, authorized=true) => {
    const response = await fetch(origin+url,{method,headers:{origin,"content-type":"application/json","x-molis-work-idempotency-key":randomUUID(),...(authorized?{"x-molis-work-control-token":token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  try {
    await git("init","-b","main");await git("config","user.name","Fixture");await git("config","user.email","fixture@example.invalid");
    await writeFile(path.join(root,"sample.txt"),"original\n");await git("add",".");await git("commit","-m","base");
    await start();const projects:string[]=[];
    for(const display_name of ["Writers A","Writers B"]){const created=await request("/api/settings/projects","POST",{display_name,user_confirmed:true});assert.equal(created.status,201);projects.push(created.body.project.project_id);await request(`/api/settings/projects/${projects.at(-1)}/plugins`,"POST",{plugin_id:"coding"});}
    assert.equal((await request(`/projects/${projects[0]}/api/workspaces`,"POST",{workspace_path:root,user_confirmed:true})).status,201);
    const state=()=>request(`/projects/${projects[0]}/api/plugins/io.molis.work.coding/state`);
    const originalState=await state();const workspace=originalState.body.workspaces.find((w:any)=>w.canonical_path===root);assert.ok(workspace,JSON.stringify(originalState));
    const endpoint=(project=projects[0])=>`/projects/${project}/api/plugins/io.molis.work.coding/workspaces/${workspace.workspace_id}/writers`;
    const reviews=(suffix="",project=projects[0])=>`/projects/${project}/api/agent/reviews${suffix}`;
    const prepare=(operation_id=randomUUID())=>request(endpoint(),"POST",{operation_id});
    const decide=(review_id:string,decision="approve",project=projects[0])=>request(reviews("/decide",project),"POST",{review_id,decision});
    assert.equal((await request(endpoint(projects[1]))).status,400);
    assert.equal((await request(endpoint(),"POST",{operation_id:randomUUID()},false)).status,403);
    const operation_id=randomUUID(), first=await prepare(operation_id);assert.equal(first.status,200,JSON.stringify(first));
    assert.equal((await prepare(operation_id)).body.review_id,first.body.review_id);
    assert.equal((await request(endpoint())).body.directories.length,0);
    assert.equal((await state()).body.workspaces.length,1,"preparation grants nothing");
    assert.equal((await decide(first.body.review_id,"approve",projects[1])).status,404);
    assert.equal((await decide(first.body.review_id,"reject")).status,200);
    assert.equal((await request(endpoint())).body.directories.length,0);
    const stale=await prepare();assert.equal(stale.status,200);
    await writeFile(path.join(root,"sample.txt"),"new commit\n");await git("add","sample.txt");await git("commit","-m","changed after review");
    await decide(stale.body.review_id);
    let rows=(await request(reviews("?workspace_id="+workspace.workspace_id))).body.reviews;
    assert.ok(rows.find((row:any)=>row.request.review_id===stale.body.review_id).receipt.effect_error);
    assert.equal((await request(endpoint())).body.directories.length,0);
    const ready=await prepare();assert.equal(ready.status,200);
    const approved=await decide(ready.body.review_id);assert.equal(approved.status,200,JSON.stringify(approved));
    const dirs=(await request(endpoint())).body.directories;assert.equal(dirs.length,1);assert.ok(dirs[0].workspace_id);
    assert.equal(await readFile(path.join(dirs[0].canonical_path,"sample.txt"),"utf8"),"new commit\n");
    assert.equal((await git("status","--porcelain")).stdout,"");
    assert.ok((await state()).body.workspaces.some((w:any)=>w.workspace_id===dirs[0].workspace_id));
    rows=(await request(reviews("?workspace_id="+workspace.workspace_id))).body.reviews;
    assert.equal(rows.find((row:any)=>row.request.review_id===ready.body.review_id).receipt.effect_settled,true);
    const pending=await prepare();assert.equal(pending.status,200);
    await close();await start();
    assert.deepEqual((await request(endpoint())).body.directories,dirs);
    assert.notEqual((await decide(pending.body.review_id)).status,200,"a restored pending has no live executor");
    assert.notEqual((await decide(ready.body.review_id)).status,200,"old approval cannot create another worktree");
    assert.deepEqual((await request(endpoint())).body.directories,dirs);
    assert.equal((await request(endpoint(projects[1]))).status,400);
  } finally { await close(); await rm(home,{recursive:true,force:true}); }
});
