import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { sampleFirstScreen } from "../scripts/first-screen/http.mjs";
import { comparisonRows, GATED_PAGES, registeredPaths, removedManifestRows } from "../scripts/first-screen/manifest.mjs";
import { firstScreenProblems } from "../scripts/gates/first-screen.mjs";
import { assetProblems, readNewAllowances } from "../scripts/gates/page-assets-policy.mjs";

const arrival = { id: "arrival-empty", path: "/" };
const signal = new AbortController().signal;
const row = (entry, fields = {}) => ({ page: arrival.id, locale: "both", entry, owner: "workbench", ...fields });

function response(status, headers, body = "") {
  return `HTTP/1.1 ${status}\r\n${headers}\r\nConnection: close\r\n\r\n${body}`;
}
function html(body) {
  return response("200 OK", `Content-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nETag: "doc"\r\nCache-Control: no-store`, body);
}
async function listen(t, serve) {
  const server = createServer(socket => {
    let headers = "";
    const onData = chunk => {
      headers += chunk.toString();
      if (!headers.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      const [, method, path] = /^(\S+) (\S+)/.exec(headers);
      socket.end(serve({ method, path, headers }));
    };
    socket.on("data", onData);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("FSS-BG-01 counts actual encoded response bytes and conditionally requests every unique path", async t => {
  const calls = [];
  const document = html('<link rel="stylesheet" href="/shared.css"><!-- <link href="/missing"> -->');
  const frame = html("<link href='/shared.css'><script defer src=frame.js></script>");
  const stylesheet = response("200 OK", 'Transfer-Encoding: chunked\r\nETag: "css"', "4\r\nbody\r\n0\r\n\r\n");
  const cached = response("304 Not Modified", 'ETag: "css"\r\nX-Fixture-Length: not an assumed constant');
  const json = response("200 OK", "Content-Type: application/json\r\nContent-Length: 2", "{}");
  const origin = await listen(t, ({ method, path, headers }) => {
    calls.push({ method, path, headers });
    if (path === "/") return document;
    if (path === "/hidden") return frame;
    if (path === "/shared.css") return /if-none-match: "css"/i.test(headers) ? cached : stylesheet;
    return json;
  });
  const samples = await sampleFirstScreen(origin, arrival, "en", ["/hidden", "/api/start"], { signal });
  assert.deepEqual([...samples.keys()], ["/", "/shared.css", "/hidden", "/frame.js", "/api/start"]);
  assert.equal(samples.get("/shared.css").cold.wire, Buffer.byteLength(stylesheet));
  assert.equal(samples.get("/shared.css").warm.wire, Buffer.byteLength(cached));
  assert.equal(samples.get("/shared.css").warm.status, 304);
  assert.equal(samples.get("/").warm.wire, Buffer.byteLength(document));
  assert.equal(samples.get("/").warm.status, 200);
  assert.ok(calls.every(call => call.method === "GET" && /cookie: molis_work_locale=en/i.test(call.headers)));
  assert.deepEqual(calls.filter(call => /if-none-match/i.test(call.headers)).map(call => call.path), ["/shared.css"]);
  assert.equal(calls.length, samples.size * 2);
});

test("FSS-BG-01/03/05 first adoption selects each side's rows without making any request failure optional", async t => {
  const common = row("/shared");
  const introduced = row("/new", { introduced: true });
  const retired = row("/old", { baseOnly: true });
  const rows = [common, introduced, retired];
  const { base, candidate } = comparisonRows(null, rows);
  assert.deepEqual(base, [common, retired]);
  assert.deepEqual(candidate, [common, introduced]);
  assert.deepEqual(comparisonRows([common, retired], rows).base, [common]);
  assert.deepEqual(removedManifestRows(base, candidate), ["arrival-empty/en /old", "arrival-empty/zh /old"]);
  assert.deepEqual(removedManifestRows([common], [{ ...common, locale: "en" }]), ["arrival-empty/zh /shared"]);

  const baseHost = await listen(t, ({ path }) => {
    if (path === "/") return html("<script src='/new'></script>");
    if (path === "/new") return response("404 Not Found", "Content-Length: 0");
    return response("200 OK", "Content-Length: 0");
  });
  await assert.rejects(sampleFirstScreen(baseHost, arrival, "zh", registeredPaths(base, arrival, "zh"), { signal }), /GET \/new: HTTP 404/);
  const candidateHost = await listen(t, ({ path }) => {
    if (path === "/") return html("candidate");
    if (path === "/new") return response("500 Internal Server Error", "Content-Length: 0");
    return response("200 OK", "Content-Length: 0");
  });
  await assert.rejects(sampleFirstScreen(candidateHost, arrival, "en", registeredPaths(candidate, arrival, "en"), { signal }), /GET \/new: HTTP 500/);
});

test("FSS-BG-03 truncated registered response and unsolicited 304 fail the sampler", async t => {
  const origin = await listen(t, ({ path }) => {
    if (path === "/") return html("complete");
    if (path === "/short") return response("200 OK", "Content-Length: 12", "one");
    return response("304 Not Modified", 'ETag: "without-a-validator"');
  });
  await assert.rejects(sampleFirstScreen(origin, arrival, "zh", ["/short"], { signal }), /GET \/short: (aborted|incomplete)/);
  await assert.rejects(sampleFirstScreen(origin, arrival, "zh", ["/unexpected"], { signal }), /GET \/unexpected: HTTP 304/);
});

const pageKey = "workbench-default/zh";
const measured = () => Object.fromEntries(GATED_PAGES.flatMap(page => ["zh", "en"].map(locale => [
  `${page}/${locale}`, { totals: { cold: 20_000, warm: 20_000 }, entries: { "/": { cold: 15_000, warm: 15_000 }, "/unchanged": { cold: 5_000, warm: 5_000 } } },
])));
const permit = fields => ({ "task.json": JSON.stringify({ reason: "fixture", review: "test review", ...fields }) });
const budget = (cold, warm) => ({ pages: { [pageKey]: { cold, warm } } });

test("FSS-BG-01/02 a warm-only regression consumes only new allowance for that page and locale", () => {
  const base = measured(), candidate = measured();
  candidate[pageKey].entries["/"].warm += 5;
  candidate[pageKey].totals.warm += 5;
  candidate["workbench-demo/en"] = { totals: { cold: 1_000_000, warm: 1_000_000 }, entries: {} };
  assert.match(firstScreenProblems(base, candidate, {}, {}).errors.join(), /workbench-default\/zh warm grew.*\+5/);
  const allowance = permit(budget(0, 5));
  assert.deepEqual(firstScreenProblems(base, candidate, allowance, {}).errors, []);
  assert.match(firstScreenProblems(base, candidate, allowance, allowance).errors.join(), /cover 0 bytes/);
  assert.match(firstScreenProblems(base, base, {}, allowance).errors.join(), /cannot be changed or removed/);
  assert.match(firstScreenProblems(base, candidate, permit(budget(5, 0)), {}).errors.join(), /warm grew/);
});

test("FSS-BG-02 a new or >10,000 B entry requires approval even when page totals shrink", () => {
  const base = measured(), candidate = measured();
  candidate[pageKey].entries = { "/": { cold: 900, warm: 900 }, "/new": { cold: 700, warm: 200 },
    "/unchanged": { cold: 15_001, warm: 15_000 } };
  candidate[pageKey].totals = { cold: 16_601, warm: 16_100 };
  const failed = firstScreenProblems(base, candidate, {}, {});
  assert.match(failed.errors.join(), /\/new: new entry requires userApproval/);
  assert.match(failed.errors.join(), /\/unchanged: growth over 10 KB requires userApproval/);
  assert.deepEqual(failed.draft.pages, { [pageKey]: { cold: 0, warm: 0 } });
  assert.deepEqual(firstScreenProblems(base, candidate, permit({ ...budget(0, 0), userApproval: "approval reference" }), {}).errors, []);
  assert.match(firstScreenProblems(base, candidate, permit({ assets: { "/assets/new.css": 3 }, userApproval: "asset only" }), {}).errors.join(), /\/new: new entry requires/);
});

test("FSS-BG-02 page-only and combined allowances preserve old asset rejection and validate both categories", () => {
  const old = { "/assets/base.css": 5 };
  const next = { "/assets/base.css": 6 };
  assert.match(assetProblems(next, old, permit(budget(1, 1)), {}).join(), /base.css grew/);
  assert.deepEqual(assetProblems(next, old, permit({ assets: { "/assets/base.css": 1 }, ...budget(1, 0) }), {}), []);
  for (const invalid of [
    {}, { assets: {} }, { pages: {} }, budget(0, 0), budget(-1, 1), budget(1.5, 1), budget("2", 1),
    { ...budget(1, 0), other: 1 }, { assets: {}, ...budget(1, 0) },
    { pages: { [pageKey]: { cold: 1, extra: 1 } } }, { pages: { "workbench-demo/en": { cold: 1, warm: 1 } } },
  ]) {
    assert.match(readNewAllowances(permit(invalid), {}).errors.join(), /invalid allowance/);
  }
});
