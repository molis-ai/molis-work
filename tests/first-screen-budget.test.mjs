import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { sampleFirstScreen } from "../scripts/first-screen/http.mjs";
import { comparisonRows, GATED_PAGES, registeredPaths, removedManifestRows, requestKey, SSE_FIRST_EVENT } from "../scripts/first-screen/manifest.mjs";
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
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let headers = "";
    const onData = chunk => {
      headers += chunk.toString();
      if (!headers.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      const [, method, path] = /^(\S+) (\S+)/.exec(headers);
      const reply = serve({ method, path, headers });
      if (typeof reply === "function") reply(socket);
      else socket.end(reply);
    };
    socket.on("data", onData);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    return new Promise(resolve => server.close(resolve));
  });
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

const headerValue = (headers, name) => new RegExp(`^${name}: ([^\\r\\n]+)`, "im").exec(headers)?.[1];
const proofHeader = "x-molis-work-page-session";
const streamHeader = response("200 OK", 'Content-Type: text/event-stream; charset=utf-8\r\nTransfer-Encoding: chunked\r\nETag: "stream"');
const chunk = text => `${Buffer.byteLength(text).toString(16)}\r\n${text}\r\n`;
const scopedRow = (entry, fields = {}) => row(entry, { response: SSE_FIRST_EVENT, introduced: true, ...fields });

function issuedPage(proof, cookie) {
  const body = `<!-- <meta name='molis-work-page-session' content='ignored.fake'> -->${proof ? `<META content='${proof}' name=molis-work-page-session>` : ""}`;
  return response("200 OK", `Content-Type: text/html\r\nETag: "page"\r\nContent-Length: ${Buffer.byteLength(body)}\r\nSet-Cookie: ${cookie}; Path=/; HttpOnly; SameSite=Strict`, body);
}

test("FSS-BG-01 counts the first complete data event for each source with fresh cold and warm proof", { timeout: 4_000 }, async t => {
  const authorities = new Map();
  const liveStreams = [];
  const calls = [];
  const fragments = [": heartbeat\r\n\r\n", "event: no-data\r\n\r\n", "da", "ta: 已收到\r", "\n\r\n"].map(chunk);
  const origin = await listen(t, ({ path, headers, method }) => {
    const cookie = headerValue(headers, "cookie");
    const etag = headerValue(headers, "if-none-match");
    const proof = headerValue(headers, proofHeader);
    calls.push({ path, cookie, etag, proof, method });
    if (path === "/" || path === "/hidden") {
      const name = path === "/" ? "top" : "hidden";
      const visit = (authorities.get(path)?.visit ?? 0) + 1;
      const next = { visit, proof: `${name}-${visit}.scope`, cookie: `molis-work-web-${name}=${name}-${visit}` };
      authorities.set(path, next);
      return etag ? response("304 Not Modified", 'ETag: "page"') : issuedPage(next.proof, next.cookie);
    }
    const referer = headerValue(headers, "referer");
    const authority = referer ? authorities.get(new URL(referer).pathname) : undefined;
    if (!authority || proof !== authority.proof || !cookie?.includes(authority.cookie) || headerValue(headers, "sec-fetch-site") !== "same-origin") {
      return response("403 Forbidden", "Content-Length: 0");
    }
    if (path === "/protected") return etag ? response("304 Not Modified", 'ETag: "json"')
      : response("200 OK", 'ETag: "json"\r\nContent-Type: application/json\r\nContent-Length: 2', "{}");
    if (etag || headerValue(headers, "accept") !== "text/event-stream") return response("400 Bad Request", "Content-Length: 0");
    return socket => {
      liveStreams.push(once(socket, "close"));
      socket.setNoDelay(true);
      socket.write(streamHeader);
      let at = 0;
      const send = () => {
        if (socket.destroyed) return;
        socket.write(fragments[at++]);
        if (at < fragments.length) setTimeout(send, 5);
      };
      send();
    };
  });
  const paths = registeredPaths([row("/hidden"), scopedRow("/events"), scopedRow("/events", { document: "/hidden" }),
    row("/protected", { document: "/hidden" })], arrival, "en");
  const samples = await sampleFirstScreen(origin, arrival, "en", paths, { signal });
  const expectedWire = Buffer.byteLength(streamHeader + fragments.join(""));
  for (const document of ["/", "/hidden"]) {
    const stream = samples.get(requestKey("/events", document, SSE_FIRST_EVENT));
    assert.equal(stream.cold.wire, expectedWire);
    assert.equal(stream.warm.wire, expectedWire);
  }
  assert.equal(samples.get(requestKey("/protected", "/hidden")).warm.status, 304);
  assert.deepEqual(calls.filter(call => call.path === "/events").map(call => call.proof), ["top-1.scope", "hidden-1.scope", "top-2.scope", "hidden-2.scope"]);
  const documents = calls.filter(call => call.path === "/" || call.path === "/hidden");
  assert.deepEqual(documents.map(call => call.cookie), ["molis_work_locale=en", "molis_work_locale=en; molis-work-web-top=top-1",
    "molis_work_locale=en; molis-work-web-top=top-1; molis-work-web-hidden=hidden-1", "molis_work_locale=en; molis-work-web-top=top-2; molis-work-web-hidden=hidden-1"]);
  assert.ok(documents.every(call => !call.proof && !call.etag));
  assert.ok(calls.every(call => call.method === "GET"));
  assert.equal(liveStreams.length, 4);
  await Promise.all(liveStreams);
  await sampleFirstScreen(origin, arrival, "zh", [], { signal });
  assert.equal(calls.at(-2).cookie, "molis_work_locale=zh", "a new locale starts with a fresh jar");
});

test("FSS-BG-03/05 a newly introduced stream is required and rejects missing proof, refusals and incomplete events", async t => {
  const rows = [scopedRow("/events")];
  const sides = comparisonRows(null, rows);
  const failures = [
    ["missing proof", undefined, null, /expected a single page-session proof from \//],
    ["wrong proof", "other.scope", response("403 Forbidden", "Content-Length: 0"), /sse-first-event from \/\]: HTTP 403/],
    ["not found", "valid.scope", response("404 Not Found", "Content-Length: 0"), /HTTP 404/],
    ["not modified", "valid.scope", response("304 Not Modified", 'ETag: "stream"'), /HTTP 304/],
    ["wrong type", "valid.scope", response("200 OK", "Content-Type: application/json\r\nContent-Length: 2", "{}"), /expected an uncompressed event stream/],
    ["short stream", "valid.scope", streamHeader + chunk(": ping\n\ndata: unfinished\n") + "0\r\n\r\n", /ended before its first complete data event/],
  ];
  for (const [name, proof, answer, failure] of failures) {
    await t.test(name, async t => {
      let attempted = 0;
      const origin = await listen(t, ({ path, headers }) => {
        if (path === "/") return issuedPage(proof, "molis-work-web-top=top-cookie");
        attempted++;
        assert.equal(headerValue(headers, proofHeader), proof);
        return answer;
      });
      await sampleFirstScreen(origin, arrival, "en", registeredPaths(sides.base, arrival, "en"), { signal });
      assert.equal(attempted, 0);
      await assert.rejects(sampleFirstScreen(origin, arrival, "en", registeredPaths(sides.candidate, arrival, "en"), { signal }), failure);
      assert.equal(attempted, proof ? 1 : 0);
    });
  }
});

test("FSS-BG-01 source paths must be registered and a top document may not register its stream twice", () => {
  assert.throws(() => registeredPaths([scopedRow("/events", { document: "/hidden" })], arrival, "en"), /unregistered source document \/hidden/);
  assert.throws(() => registeredPaths([scopedRow("/events"), scopedRow("/events", { document: "/" })], arrival, "en"), /duplicate entry .*sse-first-event from \//);
});

test("FSS-BG-03 heartbeats alone time out and an explicit abort closes the owned stream", { timeout: 14_000 }, async t => {
  const paths = registeredPaths([scopedRow("/events")], arrival, "en");
  for (const cancel of [true, false]) {
    const controller = new AbortController();
    const { promise: closed, resolve: closedStream, reject: streamError } = Promise.withResolvers();
    const origin = await listen(t, ({ path }) => {
      if (path === "/") return issuedPage("top.scope", "molis-work-web-top=top-cookie");
      return socket => {
        socket.on("error", error => { if (error.code !== "ECONNRESET") streamError(error); });
        socket.once("close", closedStream);
        socket.write(streamHeader + chunk(": ping\n\n"), () => { if (cancel) controller.abort(new Error("cancelled first-screen visit")); });
      };
    });
    const failure = cancel ? /cancelled first-screen visit/ : /HTTP response timed out/;
    await Promise.all([assert.rejects(sampleFirstScreen(origin, arrival, "en", paths, { signal: controller.signal }), failure), closed]);
  }
});

const pageKey = "workbench-default/zh";
const measured = () => Object.fromEntries(GATED_PAGES.flatMap(page => ["zh", "en"].map(locale => [
  `${page}/${locale}`, { totals: { cold: 20_000, warm: 20_000 }, entries: { "/": { cold: 15_000, warm: 15_000 }, "/unchanged": { cold: 5_000, warm: 5_000 } } },
])));
const permit = fields => ({ "task.json": JSON.stringify({ reason: "fixture", review: "test review", ...fields }) });
const budget = (cold, warm) => ({ pages: { [pageKey]: { cold, warm } } });
const entryApproval = (entry, fields = {}) => ({ pages: ["workbench-default"], locale: "zh", entry, change: "new", ...fields });
const approve = (...entryApprovals) => ({ userApproval: "approval reference", entryApprovals });

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
  assert.deepEqual(failed.draft.pages, {}, "an approval is independent of the page byte budget");
  const pageOnly = firstScreenProblems(base, candidate, permit({ ...budget(0, 0), userApproval: "approval reference" }), {});
  assert.deepEqual(pageOnly.errors, failed.errors);
  const approvedNew = permit(approve(entryApproval("/new")));
  assert.deepEqual(firstScreenProblems(base, candidate, approvedNew, {}).errors, [
    "workbench-default/zh /unchanged: growth over 10 KB requires userApproval",
  ]);
  assert.deepEqual(firstScreenProblems(base, candidate, approvedNew, approvedNew).errors, failed.errors);
  const approvedBoth = permit(approve(entryApproval("/new"), entryApproval("/unchanged", { change: "growth" })));
  assert.deepEqual(firstScreenProblems(base, candidate, approvedBoth, {}).errors, []);
  const wrongChange = permit(approve(entryApproval("/new"), entryApproval("/unchanged")));
  assert.deepEqual(firstScreenProblems(base, candidate, wrongChange, {}).errors, firstScreenProblems(base, candidate, approvedNew, {}).errors);
  assert.match(firstScreenProblems(base, candidate, permit({ assets: { "/assets/new.css": 3 }, userApproval: "asset only" }), {}).errors.join(), /\/new: new entry requires/);
});

test("FSS-BG-02 an approval for one scoped request does not cover another source, mode, language, or page", () => {
  const base = measured(), candidate = measured();
  const top = "/projects/seed/";
  const frame = "/projects/seed/side/issues/capture";
  const request = "/api/events";
  const approved = requestKey(request, frame, SSE_FIRST_EVENT);
  const topStream = requestKey(request, top, SSE_FIRST_EVENT);
  const finite = requestKey(request, frame);
  for (const key of [pageKey, "workbench-default/en", "workbench-all-plugins/zh"]) {
    candidate[key].path = top;
    candidate[key].project = "seed";
    candidate[key].entries = { "/": { cold: 200, warm: 200 }, [approved]: { cold: 1, warm: 1 } };
    candidate[key].totals = { cold: 201, warm: 201 };
  }
  candidate[pageKey].entries[topStream] = { cold: 1, warm: 1 };
  candidate[pageKey].entries[finite] = { cold: 1, warm: 1 };
  candidate[pageKey].totals = { cold: 203, warm: 203 };
  const allowance = permit(approve(entryApproval(request, { response: SSE_FIRST_EVENT, document: "/projects/<project>/side/issues/capture" })));
  const result = firstScreenProblems(base, candidate, allowance, {});
  assert.deepEqual(result.errors, [
    `${pageKey} ${topStream}: new entry requires userApproval`,
    `${pageKey} ${finite}: new entry requires userApproval`,
    `workbench-default/en ${approved}: new entry requires userApproval`,
    `workbench-all-plugins/zh ${approved}: new entry requires userApproval`,
  ]);
  assert.ok(result.approvalRows.includes(`${pageKey} ${approved} (new entry): task.json`));
});

test("FSS-BG-02 a startup pack approval matches a single content address for that owner and language", () => {
  const base = measured(), candidate = measured();
  const localeEntry = (owner, tag, digit) => `/assets/locale/${owner}.${tag}.${digit.repeat(24)}.js`;
  const approved = localeEntry("workbench", "zh", "a");
  const allowance = permit(approve(entryApproval("/assets/locale/workbench.zh.<digest>.js")));
  const next = candidate[pageKey];
  next.entries = { "/": { cold: 900, warm: 900 }, [approved]: { cold: 500, warm: 100 } };
  next.totals = { cold: 1400, warm: 1000 };
  assert.deepEqual(firstScreenProblems(base, candidate, allowance, {}).errors, []);
  for (const path of [localeEntry("workbench", "en", "b"), localeEntry("other", "zh", "b"), `${approved}?other=1`]) {
    next.entries[path] = { cold: 500, warm: 100 };
    next.totals = { cold: 1900, warm: 1100 };
    assert.deepEqual(firstScreenProblems(base, candidate, allowance, {}).errors, [`${pageKey} ${path}: new entry requires userApproval`]);
    delete next.entries[path];
  }
  const duplicate = localeEntry("workbench", "zh", "b");
  next.entries[duplicate] = { cold: 500, warm: 100 };
  assert.deepEqual(firstScreenProblems(base, candidate, allowance, {}).errors, [
    `${pageKey} ${duplicate}: multiple paths for /assets/locale/workbench.zh.<digest>.js`,
  ]);
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
    { entryApprovals: [entryApproval("/new")] }, approve(), approve(entryApproval("/*", { pages: ["*"] })),
    approve(entryApproval("/new", { response: "all-events" })), approve(entryApproval("/new", { extra: true })),
    approve(entryApproval("/assets/locale/workbench.en.<digest>.js")), approve(entryApproval("/foo.<digest>.js")),
  ]) {
    assert.match(readNewAllowances(permit(invalid), {}).errors.join(), /invalid allowance/);
  }
});
