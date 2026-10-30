import assert from "node:assert/strict";
import test from "node:test";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { deferred, grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { backgroundProbe } from "./fixtures/plugin-background.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

test("SYS-15 S-47 registered HTTP pages allow only their own concrete routes and do not receive Runtime services", { timeout: 30_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Registered pages"), other = await f.project("Other registered pages");
  const prefix = `/projects/${project.project_id}`;
  const open = async (pluginId: string) => {
    const response = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: pluginId } });
    assert.equal(response.status, 200, await response.clone().text());
    return { "x-molis-plugin-page": (await response.json()).page_id as string };
  };
  for (const [id, read, foreign] of [["io.molis.work.plugin-builder", "/api/plugin-builder/studio/state", "/api/alchemist/studio/api/v1/bootstrap"],
    ["io.molis.work.alchemist", "/api/alchemist/studio/api/v1/bootstrap", "/api/plugin-builder/studio/state"]]) {
    const headers = await open(id), second = await open(id);
    assert.equal((await f.request(prefix + read, { headers })).status, 200);
    for (const path of [foreign, "/api/settings/models", `/api/plugins/${id}/view-revision`, "/api/host/directory-grants", "/api/host/plugin-page-actions", "/api/host/plugin-page-files"]) {
      const result = await f.request(prefix + path, { headers, ...(path.startsWith("/api/host/") ? { method: "POST", body: {} } : {}) });
      assert.equal(result.status, 403, path + ": " + await result.text());
    }
    assert.equal((await f.request(`/projects/${other.project_id}` + read, { headers })).status, 403);
    await f.request(prefix + "/api/host/plugin-pages/" + headers["x-molis-plugin-page"], { method: "DELETE" });
    assert.equal((await f.request(prefix + read, { headers })).status, 403);
    assert.equal((await f.request(prefix + read, { headers: second })).status, 200, "closing one view does not revoke a different view");
  }
});

test("SYS-15 S-47 page authority allows declared routes and refuses other plugins, lifecycle and owner services", async t => {
  const a = homeProbe("pagea"), b = homeProbe("pageb");
  a.definition.manifest.routes!.push({ route_id: "collision", method: "POST", path: "/disable" });
  const start = a.definition.start;
  a.definition.start = async context => {
    const contribution = await start(context); assert.equal(contribution.kind, "app");
    if (contribution.kind !== "app") throw new Error("Expected app");
    return { ...contribution, routes: [...(contribution.routes ?? []), { route_id: "collision", handle: () => ({ status: 200, body: {} }) }] };
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [a.definition, b.definition] } });
  await grantHomeProbe(f.host, a); await grantHomeProbe(f.host, b);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: a.id } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json(); const headers = { "x-molis-plugin-page": page_id };
  assert.equal((await f.request(`/api/plugins/${a.id}/save`, { method: "POST", body: { text: "owned" }, headers })).status, 200);
  assert.equal((await (await f.request(`/api/plugins/${a.id}/state`, { headers })).json()).value, "owned");
  for (const path of [`/api/plugins/${b.id}/state`, `/api/plugins/${a.id}/disable`, "/api/host/plugin-pages", "/api/assistant/works", "/api/settings/projects", "/settings", "/"]) {
    const response = await f.request(path, { method: path.endsWith("disable") || path.endsWith("plugin-pages") ? "POST" : "GET", headers });
    assert.equal(response.status, 403, `${path}: ${await response.text()}`);
  }
  assert.equal((await f.request("/api/host/directory-grants", { method: "POST", body: { plugin_id: a.id }, headers })).status, 403, "undeclared directory permission");
  assert.equal((await f.request(`/api/plugins/${a.id}/state`, { headers: { "x-molis-plugin-page": "invented" } })).status, 403);
  await grantHomeProbe(f.host, a);
  assert.equal((await f.request(`/api/plugins/${a.id}/state`, { headers })).status, 403, "same installation after activation restart");
  assert.equal((await f.request(`/api/plugins/${a.id}/state`)).status, 200, "the owner's independent session still works");
});

test("SYS-15 S-47 project page cannot switch project or Home and deletion invalidates its authority", async t => {
  const f = await serveHomeRuntime(t), p = await f.project("Page owner"), q = await f.project("Other page");
  const prefix = `/projects/${p.project_id}`;
  const response = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: "io.molis.work.cognia" } });
  assert.equal(response.status, 200, await response.clone().text());
  const { page_id } = await response.json(), headers = { "x-molis-plugin-page": page_id };
  const library = "/api/plugins/io.molis.work.cognia/library";
  assert.equal((await f.request(prefix + library, { headers })).status, 200);
  assert.equal((await f.request(`/projects/${q.project_id}` + library, { headers })).status, 403);
  assert.equal((await f.request(library, { headers })).status, 403);
  assert.equal((await f.request(prefix + "/api/host/directory-grants", { method: "POST", body: { plugin_id: "io.molis.work.todo" }, headers })).status, 403);
  await projectDeletedHooksFor(f.home).clear("plugin-pages", p.project_id);
  assert.equal((await f.request(prefix + library, { headers })).status, 403);
});

test("SYS-15 S-47 closing a page cancels a running command without revoking the plugin's other pages", async t => {
  const probe = homeProbe("closingpage"), entered = deferred(), release = deferred();
  probe.behavior.ask = async context => { entered.resolve(); await release.promise; context.services!.storage!.set("late", "must not be written"); return "late"; };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  const { page_id } = await opened.json();
  const pending = f.request(`/api/plugins/${probe.id}/ask`, { method: "POST", body: {}, headers: { "x-molis-plugin-page": page_id } });
  await entered.promise;
  assert.equal((await f.request(`/api/host/plugin-pages/${page_id}`, { method: "DELETE" })).status, 200);
  release.resolve(); assert.equal((await pending).status, 403);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null);
  assert.equal((await f.request(`/api/plugins/${probe.id}/state`)).status, 200);
});

test("SYS-15 S-47 toolbar callbacks retain the exact page, project and lifetime; an ordinary page cannot call them", async t => {
  const f = await serveHomeRuntime(t), p = await f.project("Toolbar owner"), q = await f.project("Other toolbar");
  const prefix = `/projects/${p.project_id}`;
  const opened = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: "io.molis.work.cognia" } });
  assert.equal(opened.status, 200);
  const { page_id } = await opened.json(), headers = { "x-molis-context-page": page_id };
  const post = (path: string, selected = headers) => f.request(path, { method: "POST", headers: selected, body: {} });
  for (const operation of ["prepare", "attach"]) {
    const path = prefix + "/api/contextual/" + operation;
    const selected = await post(path);
    assert.equal(selected.status, 400, await selected.clone().text());
    assert.equal((await selected.json()).code, "contextual.input_invalid", "only the bound callback reaches contextual input validation");
    assert.equal((await f.request(path, { method: "POST", body: {}, headers: { "x-molis-plugin-page": page_id } })).status, 403);
    assert.equal((await f.request(path, { method: "POST", body: {}, headers: { ...headers, "x-molis-plugin-page": page_id } })).status, 403);
    assert.equal((await post(path, { "x-molis-context-page": "invented" })).status, 403);
    assert.equal((await post(`/projects/${q.project_id}/api/contextual/${operation}`)).status, 403);
  }
  assert.equal((await post(prefix + "/api/contextual/create")).status, 403, "the callback does not grant arbitrary owner operations");
  // SYS-15-U4: the shell may hand this page's object to another owner, never a forged source or an ordinary child request.
  for (const [path, body] of [
    ["/api/placement/convert", {source:{kind:"todo_item",id:"foreign"},to:{station:"pages"},to_project_id:p.project_id,request_id:"foreign"}],
    ["/api/plugins/io.molis.work.todo/items", {title:"forged",sources:[{kind:"todo",title:"forged",subject:{kind:"todo_item",id:"foreign"}}]}],
  ] as const) {
    const refused = await f.request(prefix + path, {method:"POST",headers,body});
    assert.equal(refused.status, 403, await refused.clone().text());
    assert.equal((await f.request(prefix + path, {method:"POST",headers:{"x-molis-plugin-page":page_id},body})).status, 403);
    assert.equal((await f.request(`/projects/${q.project_id}` + path, {method:"POST",headers,body})).status, 403);
  }

  await f.request(prefix + "/api/host/plugin-pages/" + page_id, { method: "DELETE" });
  assert.equal((await post(prefix + "/api/contextual/prepare")).status, 403, "closing the page also closes its offered callback");
});

test("SYS-15-U14 S-47 object placement uses the owner's declared scope and rejects forged projects and kinds", async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Object scope");
  const prefix = `/projects/${project.project_id}`;
  const open = async (id: string) => {
    const response = await f.request(prefix + "/api/host/plugin-pages", {method:"POST",body:{plugin_id:`io.molis.work.${id}`}});
    assert.equal(response.status, 200, await response.clone().text());
    return {"x-molis-plugin-page":(await response.json()).page_id as string};
  };
  const shelf = await open("shelf"), pages = await open("pages");
  const admitted = await f.request("/api/plugins/io.molis.work.shelf/items", {method:"POST",body:{text:"Personal material",title:"Personal material"}});
  assert.equal(admitted.status, 200, await admitted.clone().text());
  const item = (await admitted.json()).item;
  const store = openPagesStore(f.home);
  const document = store.create({project_id:project.project_id,title:"Project document"}); store.close();
  const describe = (headers: Record<string,string>, object: {kind:string;id:string;project_id:string|null}) =>
    f.request(prefix + "/api/placement/describe", {method:"POST",headers,body:{object}});
  const personal = {kind:"shelf_item",id:item.item_id,project_id:null};
  const local = {kind:"pages_document",id:document.id,project_id:project.project_id};
  for (const [headers, object] of [[shelf,personal],[pages,local]] as const) {
    const response = await describe(headers,object);
    assert.equal(response.status,200,await response.clone().text());
  }
  for (const [headers, object] of [[shelf,{...personal,project_id:project.project_id}], [pages,{...local,project_id:null}],
    [pages,{...local,project_id:"different-project"}], [shelf,local], [pages,personal]] as const)
    assert.equal((await describe(headers,object)).status,403);
});

test("SYS-15 S-47 an opaque frame cannot navigate into owner HTML to recover a token", async t => {
  const f = await serveHomeRuntime(t);
  const refused = await f.request("/", { authorized: false, headers: { "sec-fetch-dest": "iframe", "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" } });
  assert.equal(refused.status, 403); assert.doesNotMatch(await refused.text(), /molis-work-control-token/);
  const owner = await f.request("/", { headers: { "sec-fetch-dest": "iframe", "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate" } });
  assert.equal(owner.status, 200, "the shell's trusted panes keep their navigation");
});

test("SYS-15 S-47 a raw route cannot return buffered private content after its page closes", async t => {
  const probe = homeProbe("bufferedpage"), entered = deferred(), release = deferred();
  probe.definition.manifest.routes!.push({ route_id: "buffered", method: "GET", path: "/buffered" });
  const start = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await start(context); assert.equal(contribution.kind, "app");
    if (contribution.kind !== "app") throw new Error("Expected app");
    return { ...contribution, routes: [...(contribution.routes ?? []), { route_id: "buffered", handle: async () => {
      entered.resolve(); await release.promise; return { status: 200, body: { private: "buffered private content" } };
    } }] };
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  const { page_id } = await opened.json();
  const pending = f.request(`/api/plugins/${probe.id}/buffered`, { headers: { "x-molis-plugin-page": page_id } });
  await entered.promise;
  await f.request(`/api/host/plugin-pages/${page_id}`, { method: "DELETE" });
  release.resolve(); const response = await pending;
  assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /buffered private content/);
});

test("SYS-15 S-47 page actions use the real definition, declared dependencies and installation grants", async t => {
  const source = homeProbe("pagesource"), target = homeProbe("pagetarget");
  target.state.action.audiences.push("plugin");
  source.definition.manifest.capabilities.consumes.push(target.state.capability_id, target.save.capability_id);
  source.definition.manifest.permissions.push({ permission: target.permissions[1]!, required: false, reason: "读取所声明的依赖" });
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [source.definition, target.definition] } });
  await grantHomeProbe(f.host, source, [...source.permissions, target.permissions[1]!]); await grantHomeProbe(f.host, target);
  await f.request(`/api/plugins/${target.id}/save`, { method: "POST", body: { text: "target-owned" } });
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: source.id } });
  const { page_id } = await opened.json();
  const invoke = (reference: { capability_id: string; version: number; provider_id?: string }, input: unknown = {}) =>
    f.request("/api/host/plugin-page-actions", { method: "POST", headers: { "x-molis-plugin-page": page_id }, body: { reference, input } });
  const own = await invoke(source.save, { text: "own-page" }); assert.equal(own.status, 200, await own.clone().text());
  assert.equal((await (await invoke(source.state)).json()).value, "own-page");
  const consumed = await invoke(target.state); assert.equal(consumed.status, 200, await consumed.clone().text());
  assert.equal((await consumed.json()).value, "target-owned");
  assert.notEqual((await invoke(target.save, { text: "forbidden" })).status, 200, "consumes alone does not grant the target's write or audience");
  assert.equal((await invoke(target.ask)).status, 403, "undeclared dependency");
  assert.equal((await invoke({ ...source.state, provider_id: target.id })).status, 403, "cannot replace an own action's provider");
  assert.equal((await f.request("/api/host/plugin-page-actions", { method: "POST", body: { reference: source.state, input: {} } })).status, 403);
  assert.equal((await (await f.request(`/api/plugins/${target.id}/state`)).json()).value, "target-owned");
});

for (const transport of ["route", "action"] as const) test(`SYS-15 S-47 ${transport} accepted background work outlives the page but retains installation authority`, async t => {
  const probe = backgroundProbe("pagejob" + transport), entered = deferred(), release = deferred();
  probe.behavior.work = async () => { entered.resolve(); await release.promise; return "accepted work"; };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  const { page_id } = await opened.json(), headers = { "x-molis-plugin-page": page_id };
  try {
    const response = await f.request(transport === "route" ? `/api/plugins/${probe.id}/background` : "/api/host/plugin-page-actions", {
      method: "POST", headers, body: transport === "route" ? { id: "job" } : { reference: probe.start, input: { id: "job" } },
    });
    assert.equal(response.status, 200, await response.clone().text()); await entered.promise;
    await f.request(`/api/host/plugin-pages/${page_id}`, { method: "DELETE" });
    assert.equal(probe.controls[0]!.signal!.aborted, false);
    release.resolve(); assert.equal(await probe.handles[0]!.result, "accepted work");
    assert.equal(probe.stored("result.job"), "accepted work");
  } finally { release.resolve(); }
});


test("SYS-15-U5 S-47 Files and Git previews use declared public reads; raw foreign routes and undeclared consumers stay refused", async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Companion page previews");
  const prefix = `/projects/${project.project_id}`;
  for (const plugin_id of ["coding", "files", "git", "diff", "text-stats"]) {
    const enabled = await f.request(`/api/settings/projects/${project.project_id}/plugins`, {method: "POST", body: {plugin_id}});
    assert.equal(enabled.status, 200, await enabled.clone().text());
  }
  const rendered = await f.request(prefix + "/"); assert.equal(rendered.status, 200);
  for (const [source, capabilities] of [["files", ["diff.state", "text-stats.state"]], ["git", ["diff.state"]], ["coding", ["diff.state", "text-stats.state"]]] as const) {
    const opened = await f.request(prefix + "/api/host/plugin-pages", {method: "POST", body: {plugin_id: "io.molis.work." + source}});
    assert.equal(opened.status, 200, await opened.clone().text());
    const {page_id} = await opened.json(), headers = {"x-molis-plugin-page": page_id};
    for (const capability_id of capabilities) {
      const response = await f.request(prefix + "/api/host/plugin-page-actions", {method: "POST", headers, body: {reference: {capability_id, version: 1}, input: {}}});
      assert.equal(response.status, 200, await response.clone().text());
      const result = await response.json(); assert.equal(result.view.phase, "waiting"); assert.match(result.html, /data-phase="waiting"/);
    }
    assert.equal((await f.request(prefix + "/api/plugins/io.molis.work.diff/state", {headers})).status, 403);
    // SYS-15-U7: embedding declares only a presentation invalidation hint; ordinary routes retain their own authority.
    assert.equal((await f.request(prefix + "/api/plugins/io.molis.work.git/view-revision", {headers})).status, source === "coding" || source === "git" ? 200 : 403);
    if (source === "coding") {
      assert.equal((await f.request(prefix + "/api/plugins/io.molis.work.files/view-revision", {headers})).status, 200);
      assert.equal((await f.request(prefix + "/api/plugins/io.molis.work.files/state", {headers})).status, 403);
      assert.equal((await f.request(prefix + "/api/plugins/io.molis.work.pages/view-revision", {headers})).status, 403);
    }
    assert.equal((await f.request(prefix + "/api/host/plugin-page-actions", {method: "POST", headers,
      body: {reference: {capability_id: "diff.compare", version: 1}, input: {before: "a", after: "b"}}})).status, 403);
  }
});


test("SYS-15-U8 S-47 required actions need both a consumer declaration and the consumer's grant", async t => {
  for (const mode of ["allowed", "undeclared", "ungranted"] as const) await t.test(mode, async t => {
    const source = homeProbe("dependencypage"), target = homeProbe("dependencyreader"), leaf = homeProbe("dependencydata");
    leaf.state.action.audiences.push("plugin"); target.state.action.audiences.push("plugin");
    Object.assign(target.state.action, {required_actions:[{capability_id:leaf.state.capability_id,version:1}]});
    target.definition.manifest.capabilities.consumes.push(leaf.state.capability_id);
    target.definition.manifest.permissions.push({permission:leaf.permissions[1]!,required:false,reason:"读取明确的依赖"});
    source.definition.manifest.capabilities.consumes.push(target.state.capability_id);
    if (mode !== "undeclared") source.definition.manifest.capabilities.consumes.push(leaf.state.capability_id);
    for (const permission of [target.permissions[1]!, leaf.permissions[1]!]) source.definition.manifest.permissions.push({permission,required:false,reason:"读取明确的依赖"});
    const start = target.definition.start;
    target.definition.start = async context => {
      const contribution = await start(context); assert.equal(contribution.kind, "app");
      if (contribution.kind !== "app") throw new Error("Expected app");
      return {...contribution, actions:contribution.actions?.map(action => action.capability_id === target.state.capability_id
        ? {...action,handle:() => context.services!.actions!.invoke(leaf.state,{})} : action)};
    };
    const f = await serveHomeRuntime(t, {pluginFixtures:{home:[source.definition,target.definition,leaf.definition]}});
    await grantHomeProbe(f.host, leaf); await grantHomeProbe(f.host, target,[...target.permissions,leaf.permissions[1]!]);
    await grantHomeProbe(f.host, source,[...source.permissions,target.permissions[1]!,...(mode === "ungranted" ? [] : [leaf.permissions[1]!])]);
    await f.request(`/api/plugins/${leaf.id}/save`, {method:"POST",body:{text:"declared dependency data"}});
    const opened = await f.request("/api/host/plugin-pages", {method:"POST",body:{plugin_id:source.id}});
    const {page_id} = await opened.json();
    const result = await f.request("/api/host/plugin-page-actions", {method:"POST",headers:{"x-molis-plugin-page":page_id},
      body:{reference:{capability_id:target.state.capability_id,version:1},input:{}}});
    assert.equal(result.status, mode === "allowed" ? 200 : 403, await result.clone().text());
    if (mode === "allowed") assert.equal((await result.json()).value,"declared dependency data");
    else assert.equal((await result.json()).code,"actions.forbidden");
  });
});


test("SYS-15-L4 S-47 closing cleanup runs once, uses its own current authority and cancels ordinary work", async t => {
  const probe = homeProbe("pagecleanup"), foreign = homeProbe("foreigncleanup"), entered = deferred(), release = deferred();
  probe.definition.manifest.capabilities.consumes.push(foreign.save.capability_id);
  probe.behavior.ask = async context => { entered.resolve(); await release.promise; context.services!.storage!.set("late", "forbidden"); return "late"; };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition, foreign.definition] } });
  await grantHomeProbe(f.host, probe); await grantHomeProbe(f.host, foreign);
  const open = async () => (await (await f.request("/api/host/plugin-pages", {method:"POST",body:{plugin_id:probe.id}})).json()).page_id as string;
  const finish = (id: string, text: string, reference = {capability_id:probe.save.capability_id,version:1}) =>
    f.request("/api/host/plugin-pages/"+id, {method:"DELETE",body:{closing:{reference,input:{text}}}});
  const page = await open(), other = await open();
  const pending = f.request(`/api/plugins/${probe.id}/ask`, {method:"POST",body:{},headers:{"x-molis-plugin-page":page}});
  await entered.promise;
  assert.equal((await finish(page, "cleanup")).status, 200);
  release.resolve(); assert.equal((await pending).status, 403);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("note"), "cleanup");
  assert.equal((await finish(page, "duplicate")).status, 200);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("note"), "cleanup");
  assert.equal((await f.request(`/api/plugins/${probe.id}/state`, {headers:{"x-molis-plugin-page":other}})).status, 200);
  assert.equal((await finish(await open(), "foreign", {capability_id:foreign.save.capability_id,version:1})).status, 403, "even a consumed action cannot be closing cleanup");
  assert.equal(foreign.contexts.at(-1)!.services!.storage!.get("note"), null);
  const revoked = await open(); await grantHomeProbe(f.host, probe, probe.permissions.filter(permission => permission !== "pagecleanup:write"));
  assert.equal((await finish(revoked, "revoked")).status, 200);
  assert.equal((await finish(await open(), "missing grant")).status, 403);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("note"), "cleanup");
});


test("SYS-15-L4 S-47 a second close cancels cleanup already waiting before it can write", async t => {
  const probe = homeProbe("closingrace"), entered = deferred(), release = deferred();
  t.after(() => release.resolve());
  probe.behavior.ask = async context => { entered.resolve(); await release.promise; context.services!.storage!.set("late", "forbidden"); return "late"; };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const {page_id} = await (await f.request("/api/host/plugin-pages", {method:"POST",body:{plugin_id:probe.id}})).json();
  const closing = f.request("/api/host/plugin-pages/"+page_id, {method:"DELETE",body:{closing:{reference:{capability_id:probe.ask.capability_id,version:1},input:{}}}});
  await entered.promise;
  assert.equal((await f.request("/api/host/plugin-pages/"+page_id, {method:"DELETE"})).status, 200);
  release.resolve(); assert.equal((await closing).status, 403);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("late"), null);
});

/** A Home probe with one more declared route, `GET /items/:id`, which records the id it was given: a shape that can hold a bad percent-encoding. */
async function serveItemPage(t: Parameters<typeof serveHomeRuntime>[0], name: string) {
  const probe = homeProbe(name), answered: string[] = [];
  probe.definition.manifest.routes!.push({ route_id: "item", method: "GET", path: "/items/:id", permission: `${name}:read` });
  const start = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await start(context);
    if (contribution.kind !== "app") throw new Error("Expected app");
    return { ...contribution, routes: [...(contribution.routes ?? []), { route_id: "item", handle: request => { answered.push(request.params.id as string); return { status: 200, body: { id: request.params.id } }; } }] };
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(f.host, probe);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  assert.equal(opened.status, 200, await opened.clone().text());
  return { f, id: probe.id, page: ((await opened.json()) as { page_id: string }).page_id, answered };
}

test("SYS-15 S-47 RAC-1809 a page's request to a declared route's shape with bad percent-encoding is the caller's invalid path, never an unhandled failure", { timeout: 30_000 }, async t => {
  // The page guard asked the Runtime matcher for the route, which decodes every segment and throws a URIError on a bad one; nothing took it and the
  // Host answered 500 (plugin-page-authority.ts:134). `matchPluginRoute` now answers the plugin's own declared shape with 400 before any handler runs.
  const { f, id, page, answered } = await serveItemPage(t, "pagebad");
  const headers = { "x-molis-plugin-page": page }, route = `/api/plugins/${id}/items/`;
  const plain = await f.request(route + "abc", { headers });
  assert.equal(plain.status, 200, await plain.clone().text());
  assert.equal((await plain.json()).id, "abc", "a well-formed path still reaches the route");
  assert.equal((await (await f.request(route + "%E2%9C%93", { headers })).json()).id, "✓", "a valid percent-encoding is still decoded for the route");
  for (const bad of ["%E0%A4%A", "%zz", "50%"]) {
    const refused = await f.request(route + bad, { headers });
    assert.equal(refused.status, 400, `${bad}: ${await refused.clone().text()}`);
    assert.equal((await refused.json()).code, "host.request_path_invalid", bad);
  }
  assert.deepEqual(answered, ["abc", "✓"], "the route's handler did not run for a malformed path");
});

test("SYS-15 S-47 RAC-1810 a page's request with bad percent-encoding outside its declared routes is refused like any undeclared path, and a toolbar callback never reaches the matcher", { timeout: 30_000 }, async t => {
  // An undeclared shape is not the plugin's route: the guard refuses it with 403, as it refuses a well-formed undeclared path (it used to be 500). A toolbar
  // callback (`x-molis-context-page`) is let through only for its own owner choices and never uses a route, so even a declared shape with a bad encoding is 403.
  const { f, id, page } = await serveItemPage(t, "pageundeclared");
  for (const path of [`/api/plugins/${id}/not-declared/%E0%A4%A`, `/api/plugins/%E0%A4%A/state`, `/api/plugins/${id}/items/%zz/more`, `/api/plugins/${id}/state%`]) {
    const refused = await f.request(path, { headers: { "x-molis-plugin-page": page } });
    assert.equal(refused.status, 403, `${path}: ${await refused.clone().text()}`);
    assert.equal((await refused.json()).code, "actions.forbidden", path);
  }
  const declared = `/api/plugins/${id}/items/%E0%A4%A`;
  for (const headers of [{ "x-molis-context-page": page }, { "x-molis-context-page": page, "x-molis-plugin-page": page }]) {
    const callback = await f.request(declared, { headers });
    assert.equal(callback.status, 403, `${Object.keys(headers).join("+")}: ${await callback.clone().text()}`);
  }
});

test("SYS-15 S-47 RAC-1811 a plain Home request with bad percent-encoding is 400 for a declared route's shape and the plugin's own 404 for any other path", { timeout: 30_000 }, async t => {
  // No page header: the guard lets the request by and `dispatchRuntimePluginRoute` decides (T-043, #1391). This already holds on main; it pins the Home
  // prefix and the function the dispatch now shares with the page guard.
  const { f, id, answered } = await serveItemPage(t, "plainbad");
  const declared = await f.request(`/api/plugins/${id}/items/%E0%A4%A`);
  assert.equal(declared.status, 400, await declared.clone().text());
  assert.equal((await declared.json()).code, "host.request_path_invalid");
  const other = await f.request(`/api/plugins/${id}/not-declared/%E0%A4%A`);
  assert.equal(other.status, 404, await other.clone().text());
  assert.equal((await other.json()).error, "插件没有这个入口");
  assert.deepEqual(answered, [], "the route's handler did not run for a malformed path");
  assert.equal((await f.request(`/api/plugins/${id}/items/abc`)).status, 200, "a well-formed path still reaches the route");
  assert.deepEqual(answered, ["abc"]);
});

// RAC-2412 (S-47): the workbench keeps only the address parameters and fragments the settings page being opened reads. A page can push any
// address into a settings page through `molis-work:open-settings-path`; undeclared query parameters and an undeclared fragment must not
// reach it, while what the page reads stays. The same table is injected into the shell and into the standalone Home model settings dialog.
import {
  GLOBAL_SETTINGS_ADDRESS_PARAMS,
  HOME_MODEL_SETTINGS_ADDRESS_PARAMS,
  HOME_MODEL_SETTINGS_CLIENT_SCRIPT,
  PLUGIN_SETTINGS_ADDRESS_PARAMS,
  PROJECT_SETTINGS_ADDRESS_PARAMS,
  SETTINGS_DIRECTORY_FACTORY_SCRIPT,
} from "@molis-ai/molis-work-app-workbench";
import vm from "node:vm";

/** The `table` a script injected: `const NAME = {…};` read back out of its source. */
function injectedTable(script: string, name: string): unknown {
  const match = new RegExp(`const ${name} = (\\{.*?\\});`).exec(script);
  assert.ok(match, `${name} is injected`);
  return JSON.parse(match[1]!);
}

type Event = { type: string; detail?: { href?: string } };
type Listener = (event: Event) => void;

/** A settings-directory shell over a page mock: the address it sends to the settings page after a page hands one over. */
function openSettingsAddress(href: string, pluginSections: readonly string[] = []): string {
  const listeners = new Map<string, Listener[]>();
  const opened: string[] = [];
  const document = {
    querySelector: (selector: string) => selector.includes("data-directory-panel") || selector.includes("data-work-surface") ? panel() : null,
    querySelectorAll: (selector: string) => selector.includes("[data-settings-section]")
      ? [...["appearance", "directories", "memory", "models", "assistant", "characters", "prompts", "runtimes", "library", "connections", "access", "history", "diagnostics", "projects"], ...pluginSections].map((id) => ({ dataset: { settingsSection: id } }))
      : [],
    createElement: () => panel(),
    adoptNode: (node: unknown) => node,
    addEventListener: (type: string, listener: Listener) => { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    dispatchEvent: (event: Event) => { for (const listener of listeners.get(event.type) ?? []) listener(event); return true; },
  };
  function panel(): Record<string, unknown> {
    const node: Record<string, unknown> = { dataset: {}, children: [], hidden: false, scrollTop: 0, scrollLeft: 0, ownerDocument: document,
      className: "", textContent: "", querySelector: () => null, querySelectorAll: () => [], replaceChildren: () => {}, append: () => {},
      remove: () => {}, matches: () => false, closest: () => null, setAttribute: () => {}, addEventListener: () => {}, contains: () => false };
    return node;
  }
  const host = { translate: (text: string) => text, projectId: "p1", setDirectory: () => {}, setExclusive: () => {}, hideDirectory: () => {},
    closeCover: () => false, openCover: () => {}, registerCover: () => {}, showToast: () => {},
    noteCover: (kind: string, place: string) => { opened.push(`${kind} ${place}`); } };
  vm.runInNewContext(`(${SETTINGS_DIRECTORY_FACTORY_SCRIPT})(host)`, {
    host, document, location: { origin: "http://127.0.0.1:4173", href: "http://127.0.0.1:4173/projects/p1/" }, URL, URLSearchParams,
    molisWorkRequest: () => new Promise(() => {}), requestAnimationFrame: () => {}, CSS: { escape: (text: string) => text },
  });
  document.dispatchEvent({ type: "molis-work:open-settings-path", detail: { href } });
  assert.equal(opened.length, 1, `${href}: one settings page is opened`);
  return opened[0]!.split(" ").slice(2).join(" ");
}

/** A Home shell dialog over a page mock: what it asks the Host for after a page hands over an address. */
async function homeModelAddress(href: string): Promise<string> {
  const asked: string[] = [];
  const listeners = new Map<string, Listener[]>();
  const element = (): Record<string, unknown> => ({ dataset: {}, hidden: false, textContent: "", value: "", options: [], open: false,
    querySelector: () => element(), querySelectorAll: () => [], addEventListener: () => {}, replaceChildren: () => {}, append: () => {},
    removeAttribute: () => {}, setAttribute: () => {}, showModal: () => {}, close: () => {} });
  const dialog = element();
  const request = Object.assign((url: string) => { asked.push(url); return Promise.reject(new Error("captured")); }, { show: () => {} });
  const document = {
    querySelector: (selector: string) => selector === "[data-home-model-settings]" ? dialog : null,
    querySelectorAll: () => [],
    addEventListener: (type: string, listener: Listener) => { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    dispatchEvent: (event: Event) => { for (const listener of listeners.get(event.type) ?? []) listener(event); return true; },
  };
  vm.runInNewContext(HOME_MODEL_SETTINGS_CLIENT_SCRIPT, {
    document, location: { origin: "http://127.0.0.1:4173", href: "http://127.0.0.1:4173/" }, URL, URLSearchParams, molisWorkRequest: request,
    DOMParser: class {}, AbortController, setTimeout, clearTimeout,
  });
  const swallowed: unknown[] = [];
  const onRejection = (reason: unknown) => swallowed.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    document.dispatchEvent({ type: "molis-work:open-settings-path", detail: { href } });
    await new Promise((resolve) => setImmediate(resolve));
  } finally { process.off("unhandledRejection", onRejection); }
  assert.equal(asked.length, 1, `${href}: the dialog loads once`);
  return asked[0]!;
}

test("RAC-2412 S-47 a settings address keeps only the parameters and fragment its page reads", () => {
  assert.equal(openSettingsAddress("/settings/models?setup=1&template=balanced&x=1#frag"),
    "/settings/models?setup=1&template=balanced", "models keeps setup and template, drops x and #frag");
  assert.equal(openSettingsAddress("/settings/diagnostics?call=c-1#agent-diagnostics"),
    "/settings/diagnostics?call=c-1#agent-diagnostics", "diagnostics keeps its call and its fragment");
  assert.equal(openSettingsAddress("/settings/diagnostics?call=c-1#elsewhere"),
    "/settings/diagnostics?call=c-1", "diagnostics drops a fragment it does not read");
  assert.equal(openSettingsAddress("/capabilities/access?q=feed&format=html&bad=1"),
    "/capabilities/access?q=feed&format=html", "the access page keeps q and format, drops bad");
  assert.equal(openSettingsAddress("/projects/p1/settings/planning/method-a?project=p1&x=1#frag"),
    "/projects/p1/settings/planning/method-a?project=p1", "a nested planning page keeps project, drops x and #frag");
  assert.equal(openSettingsAddress("/settings/coding-settings?project=p1&desktop=1&x=1", ["coding-settings"]),
    "/settings/coding-settings?project=p1&desktop=1", "a plugin settings page keeps project and desktop, drops x");
});

test("RAC-2412 S-47 the Home model dialog keeps only the parameters its page reads", async () => {
  const models = new URL(await homeModelAddress("/settings/models?setup=1&template=balanced&x=1#frag"));
  assert.equal(models.searchParams.get("setup"), "1");
  assert.equal(models.searchParams.get("template"), "balanced");
  assert.equal(models.searchParams.get("x"), null, "an undeclared parameter is dropped");
  assert.equal(models.searchParams.get("embed"), "1", "the dialog still asks for the embedded document");
  assert.equal(models.hash, "", "the fragment is dropped");
  const connectors = new URL(await homeModelAddress("/capabilities/connections?setup=s-1&connector=notion&x=1"));
  assert.equal(connectors.searchParams.get("setup"), "s-1");
  assert.equal(connectors.searchParams.get("connector"), "notion");
  assert.equal(connectors.searchParams.get("x"), null);
});

test("RAC-2412 S-47 both scripts carry the one declaration table", () => {
  assert.deepEqual(injectedTable(SETTINGS_DIRECTORY_FACTORY_SCRIPT, "GLOBAL_ADDRESS_PARAMS"), JSON.parse(JSON.stringify(GLOBAL_SETTINGS_ADDRESS_PARAMS)));
  assert.deepEqual(injectedTable(SETTINGS_DIRECTORY_FACTORY_SCRIPT, "PROJECT_ADDRESS_PARAMS"), JSON.parse(JSON.stringify(PROJECT_SETTINGS_ADDRESS_PARAMS)));
  assert.deepEqual(injectedTable(SETTINGS_DIRECTORY_FACTORY_SCRIPT, "PLUGIN_ADDRESS_PARAMS"), JSON.parse(JSON.stringify(PLUGIN_SETTINGS_ADDRESS_PARAMS)));
  assert.deepEqual(injectedTable(HOME_MODEL_SETTINGS_CLIENT_SCRIPT, "HOME_ADDRESS_PARAMS"), JSON.parse(JSON.stringify(HOME_MODEL_SETTINGS_ADDRESS_PARAMS)));
});
