import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { sampleFirstScreen } from "../scripts/first-screen/http.mjs";
import { comparisonRows, GATED_PAGES, registeredPaths, removedManifestRows, requestKey, SSE_FIRST_EVENT } from "../scripts/first-screen/manifest.mjs";
import { firstScreenMeasurementKey, firstScreenProblems, firstScreenReportMatches, measureFirstScreenApart } from "../scripts/gates/first-screen.mjs";
import { parsePageAssetBudgets } from "../scripts/gates/page-assets-policy.mjs";

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
  `${page}/${locale}`, { totals: { cold: 20_000, warm: 10_000 }, entries: { "/": { cold: 15_000, warm: 8_000 }, "/unchanged": { cold: 5_000, warm: 2_000 } } },
])));
const makeBudgets = (firstScreenOverrides = {}) => ({
  routes: { shell: { maxBytes: 50_000, assets: ["/assets/a.css"] } },
  maxSingleAssetBytes: 30_000,
  maxPluginAssetBytes: 20_000,
  firstScreen: {
    "arrival-empty": { cold: 25_000, warm: 12_000 },
    chooser: { cold: 25_000, warm: 12_000 },
    "workbench-default": { cold: 25_000, warm: 12_000 },
    "workbench-all-plugins": { cold: 25_000, warm: 12_000 },
    ...firstScreenOverrides,
  },
});

test("FSS-BG-01/02 Batch 100-2 first-screen route ceilings pass inside budget, ignore demo, and reject overruns or loosening", () => {
  const candidate = measured();
  candidate["workbench-demo/en"] = { totals: { cold: 10_000_000, warm: 10_000_000 }, entries: {} };
  const budgets = makeBudgets();
  assert.deepEqual(firstScreenProblems(candidate, budgets).errors, []);

  // Small growth within the route ceiling passes with zero per-byte allowance files.
  candidate[pageKey].totals.warm = 11_500;
  assert.deepEqual(firstScreenProblems(candidate, budgets).errors, []);

  // Exceeding cold or warm route ceiling fails explicitly.
  candidate[pageKey].totals.warm = 12_001;
  assert.match(firstScreenProblems(candidate, budgets).errors.join("\n"), /workbench-default\/zh warm total 12001 B exceeds first-screen budget 12000 B/);

  // Loosening a first-screen ceiling against merge-base fails.
  const loosened = makeBudgets({ "workbench-default": { cold: 25_000, warm: 13_000 } });
  assert.match(firstScreenProblems(measured(), loosened, budgets).errors.join("\n"), /firstScreen\.workbench-default\.warm loosened 12000 → 13000/);

  // Tightening passes cleanly.
  const tightened = makeBudgets({ "workbench-default": { cold: 24_000, warm: 11_000 } });
  assert.deepEqual(firstScreenProblems(measured(), tightened, budgets).errors, []);

  // Incomplete measurement fails.
  const missing = measured();
  delete missing[pageKey];
  assert.match(firstScreenProblems(missing, budgets).errors.join("\n"), /workbench-default\/zh: incomplete page measurement/);
});

test("FSS-BG-02 Batch 100-2 page-asset-budgets.json parser validates every firstScreen gated page", () => {
  const valid = makeBudgets();
  assert.deepEqual(parsePageAssetBudgets(JSON.stringify(valid)), valid);
  const missingPage = { ...valid, firstScreen: { ...valid.firstScreen } };
  delete missingPage.firstScreen.chooser;
  assert.throws(() => parsePageAssetBudgets(JSON.stringify(missingPage)), /firstScreen\.chooser/);
  const unknownPage = { ...valid, firstScreen: { ...valid.firstScreen, "workbench-demo": { cold: 1, warm: 1 } } };
  assert.throws(() => parsePageAssetBudgets(JSON.stringify(unknownPage)), /unknown firstScreen page/);
});

test("FSS-BG-05 first-screen artifact cache keys depend on rows and validate cached measurements strictly", () => {
  const rowsA = [row("/a")], rowsB = [row("/b")];
  const keyA = firstScreenMeasurementKey(rowsA);
  assert.match(keyA, /^[0-9a-f]{24}$/);
  assert.notEqual(keyA, firstScreenMeasurementKey(rowsB));
  const pages = {
    ...measured(),
    "workbench-demo/zh": { totals: { cold: 10, warm: 10 }, entries: { "/": { cold: 10, warm: 10 } } },
    "workbench-demo/en": { totals: { cold: 10, warm: 10 }, entries: { "/": { cold: 10, warm: 10 } } },
  };
  const sha = "a".repeat(40);
  assert.equal(firstScreenReportMatches({ sha, key: keyA, pages }, sha, keyA), true);
  assert.equal(firstScreenReportMatches({ sha: "b".repeat(40), key: keyA, pages }, sha, keyA), false);
  assert.equal(firstScreenReportMatches({ sha, key: "0".repeat(24), pages }, sha, keyA), false);
  const missingDemo = { ...pages };
  delete missingDemo["workbench-demo/en"];
  assert.equal(firstScreenReportMatches({ sha, key: keyA, pages: missingDemo }, sha, keyA), false);
});

// FSS-BG-05: each build is measured by the candidate's checker, in a process of its own. A build's Host installs process-wide state
// (its UI text context), so the merge-base's and the candidate's Hosts seeded in one process refused each other's plugins.
test("FSS-BG-05 each build's first screen is measured in a child process of its own, and a failing child says why", async t => {
  const folder = mkdtempSync(join(tmpdir(), "first-screen-apart-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const script = join(folder, "measure.mjs");
  writeFileSync(script, `import { readFileSync, writeFileSync } from "node:fs";
const at = name => process.argv[process.argv.indexOf(name) + 1];
if (at("--root").endsWith("broken")) { console.error("the build is missing"); process.exit(3); }
console.log("noise a Host prints on its way");
writeFileSync(at("--pages"), JSON.stringify({ pid: process.pid, root: at("--root"), rows: JSON.parse(readFileSync(at("--measure"), "utf8")) }));
`);
  const rows = [row("<page>")];
  const base = await measureFirstScreenApart("/builds/base", rows, signal, { script });
  const candidate = await measureFirstScreenApart("/builds/candidate", rows, signal, { script });
  assert.deepEqual([base.root, candidate.root], ["/builds/base", "/builds/candidate"], "each child measures the root it is given");
  assert.deepEqual(base.rows, rows, "the rows reach the child");
  assert.ok(base.pid !== process.pid && candidate.pid !== process.pid && base.pid !== candidate.pid, "neither build is measured in this process or with the other");
  await assert.rejects(measureFirstScreenApart("/builds/broken", rows, signal, { script }), /\/builds\/broken: first-screen measurement exited 3\nthe build is missing/);
});
