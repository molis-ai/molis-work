import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Socket } from "node:net";
import { WebSocket } from "ws";
import { attachMolisWorkPtySocket } from "@molis-ai/molis-work-app-local-host";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("SYS-15-F3 S-47 Shelf opens the backend program in its owner directory, reconnects once and kills it on revocation RAC-2559", { timeout: 20_000 }, async t => {
  const f = await serveHomeRuntime(t), bin = join(f.home, "bin"); await mkdir(bin);
  await writeFile(join(bin, "codex"), "#!/bin/sh\nprintf 'OWNER_CWD=%s\\n' \"$PWD\"\nexec /bin/cat\n", { mode: 0o700 });
  const priorPath = process.env.MOLIS_WORK_LOCAL_TOOLS_PATH;
  process.env.MOLIS_WORK_LOCAL_TOOLS_PATH = bin;
  t.after(() => { if (priorPath === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS_PATH; else process.env.MOLIS_WORK_LOCAL_TOOLS_PATH = priorPath; });
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: "io.molis.work.shelf" } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json(), headers = { "x-molis-plugin-page": page_id };
  const start = () => f.request("/api/plugins/io.molis.work.shelf/terminal", { method: "POST", body: {}, headers });
  const launch = await start(); assert.equal(launch.status, 200, await launch.clone().text());
  const { panelId } = await launch.json(), client = await socketClient(t, f.origin.replace("http:", "ws:") + "/pty", page_id);
  client.send({ type: "spawn", panelId, attachOnly: true });
  const attached = await client.wait(message => message.type === "spawned");
  assert.equal(attached.attached, true);
  const output = String(attached.replay).includes("OWNER_CWD=") ? attached.replay : (await client.wait(message => message.type === "data" && String(message.data).includes("OWNER_CWD="))).data;
  assert.match(String(output), new RegExp("OWNER_CWD=" + await realpath(f.home) + "/shelf"));
  assert.equal((await (await start()).json()).panelId, panelId, "reopen attaches the same running program");
  client.send({ type: "write", panelId, data: "REATTACH_KEEPS_INPUT\n" });
  await client.wait(message => message.type === "data" && String(message.data).includes("REATTACH_KEEPS_INPUT"));
  const platform = await f.host.homePlugins!.ready(), install = f.host.homePlugins!.installation("io.molis.work.shelf")!;
  await platform.runtime.stop(install.install_id);
  assert.equal((await start()).status, 403);
  client.socket.terminate();
  const owner = new WebSocket(f.origin.replace("http:", "ws:") + "/pty");
  t.after(() => owner.terminate());
  const reply = new Promise<Record<string, unknown>>(resolve => owner.on("message", raw => {
    const message = JSON.parse(raw.toString());
    if (message.type === "ready") owner.send(JSON.stringify({ type: "spawn", panelId, attachOnly: true }));
    if (message.type === "spawned") resolve(message);
  }));
  await new Promise<void>(resolve => owner.once("open", resolve)); owner.send(JSON.stringify({ type: "auth", token: f.token }));
  const stopped = await reply; assert.equal(stopped.started, false); assert.equal(stopped.attached, false); owner.terminate();
});

function terminalProbe(name: string, launch: () => string) {
  const probe = homeProbe(name), start = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await start(context);
    assert.equal(contribution.kind, "app");
    if (contribution.kind !== "app") throw new Error("Expected app");
    return { ...contribution, actions: contribution.actions!.map(binding => binding.capability_id !== probe.ask.capability_id ? binding : {
      ...binding, async handle(caller) { await caller.beforeEffect(); return launch(); },
    }) };
  };
  return probe;
}

async function socketClient(t: TestContext, url: string, pageId: string) {
  const socket = new WebSocket(url), messages: Array<Record<string, unknown>> = [];
  socket.on("message", raw => messages.push(JSON.parse(raw.toString())));
  t.after(() => socket.terminate());
  const wait = async (predicate: (message: Record<string, unknown>) => boolean) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0]!;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Terminal event not received: " + JSON.stringify(messages));
  };
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  send({ type: "page-auth", pageId }); await wait(message => message.type === "ready");
  return { socket, send, wait, messages };
}

test("SYS-15 S-47 terminal page controls only its server-created panel and cannot spawn, cross project, take ownership or reuse a closed page", { timeout: 20_000 }, async t => {
  let pty: ReturnType<typeof attachMolisWorkPtySocket>, directory = "";
  const launch = () => { pty.spawn({ panelId: "owned-terminal", command: "/bin/cat", cwd: directory }); return "owned-terminal"; };
  const a = terminalProbe("terminala", launch), b = terminalProbe("terminalb", launch);
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [a.definition, b.definition] } }); directory = f.home;
  await grantHomeProbe(f.host, a); await grantHomeProbe(f.host, b);
  const server = createServer(), connections = new Set<Socket>();
  server.on("connection", socket => { connections.add(socket); socket.once("close", () => connections.delete(socket)); });
  pty = attachMolisWorkPtySocket(server, "fixture-terminal-owner", f.home);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { pty.killAll(); for (const socket of connections) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `ws://127.0.0.1:${address.port}/pty`;
  const page = async (id: string, prefix = "") => {
    const response = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id: id } });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).page_id as string;
  };
  const created = await f.request(`/api/plugins/${a.id}/ask`, { method: "POST", body: {} });
  assert.equal(created.status, 200, await created.clone().text()); assert.equal(pty.alive("owned-terminal"), true);
  const aPage = await page(a.id), own = await socketClient(t, url, aPage), other = await socketClient(t, url, await page(b.id));
  own.send({ type: "spawn", panelId: "owned-terminal", attachOnly: true });
  assert.equal((await own.wait(message => message.type === "spawned")).attached, true);
  own.send({ type: "write", panelId: "owned-terminal", data: "OWNED_OUTPUT\n" });
  assert.match(String((await own.wait(message => message.type === "data" && String(message.data).includes("OWNED_OUTPUT"))).data), /OWNED_OUTPUT/);
  for (const command of [{ type: "spawn", panelId: "owned-terminal", attachOnly: true },
    { type: "write", panelId: "owned-terminal", data: "FORBIDDEN_INPUT\n" }, { type: "kill", panelId: "owned-terminal" }]) {
    other.send(command); assert.match(String((await other.wait(message => message.type === "error")).message), /不属于/);
  }
  assert.equal(other.messages.some(message => message.type === "data"), false);
  own.send({ type: "spawn", panelId: "owned-terminal", attachOnly: true, command: "/bin/sh" });
  assert.match(String((await own.wait(message => message.type === "error")).message), /只能连接/);
  own.send({ type: "spawn", panelId: "invented", command: "/bin/sh", cwd: directory });
  assert.match(String((await own.wait(message => message.type === "error")).message), /只能连接/);
  assert.equal(pty.alive("invented"), false);
  assert.equal((await f.request(`/api/plugins/${b.id}/ask`, { method: "POST", body: {} })).status, 403, "another Runtime invocation cannot take the existing panel");
  const project = await f.project("Terminal boundary"), projectPage = await socketClient(t, url, await page(a.id, `/projects/${project.project_id}`));
  projectPage.send({ type: "spawn", panelId: "owned-terminal", attachOnly: true });
  assert.match(String((await projectPage.wait(message => message.type === "error")).message), /不属于/);
  await f.request(`/api/host/plugin-pages/${aPage}`, { method: "DELETE" });
  own.send({ type: "write", panelId: "owned-terminal", data: "STALE_INPUT\n" });
  assert.match(String((await own.wait(message => message.type === "error")).message), /失效/);
  assert.equal(pty.alive("owned-terminal"), true, "closing the page does not restart or kill its accepted terminal");
  const reopened = await socketClient(t, url, await page(a.id));
  reopened.send({ type: "spawn", panelId: "owned-terminal", attachOnly: true });
  const replay = await reopened.wait(message => message.type === "spawned");
  assert.match(String(replay.replay), /OWNED_OUTPUT/); assert.doesNotMatch(String(replay.replay), /FORBIDDEN_INPUT|STALE_INPUT/);
  reopened.send({ type: "kill", panelId: "owned-terminal" });
  assert.equal((await reopened.wait(message => message.type === "exit")).signal, 15);
  assert.equal(pty.alive("owned-terminal"), false);
  for (const client of [own, other, projectPage, reopened]) client.socket.terminate();
});
