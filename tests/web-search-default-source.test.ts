import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { WEB_SEARCH_BUILTIN_SOURCE } from "@molis-ai/molis-work-contracts/services/web-search";
import { runWebSearch, setWebSearchDefault, webSearchSettings } from "../apps/local-host/dist/web-search-service.js";
import { homeConnectorDirectory } from "../apps/local-host/dist/connector-directory.js";

/**
 * The default web search source (specs/assistant-service-connections §13.7; ASC-54, ASC-55). The three search services are reached
 * through a fake `fetch`: the user decided 2026-11-18 to test them against fakes, real keys later in an isolated Home.
 */
type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };

async function withHome(run: (home: string, seen: Seen[], answer: (fn: (seen: Seen) => Response | Promise<Response>) => void) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "molis-work-web-search-"));
  const before = process.env.MOLIS_WORK_HOME, realFetch = globalThis.fetch;
  process.env.MOLIS_WORK_HOME = home;
  const seen: Seen[] = [];
  let reply: (seen: Seen) => Response | Promise<Response> = () => Response.json({ results: [] });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const entry = { url: String(input), method: init?.method ?? "GET", headers, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    seen.push(entry);
    return reply(entry);
  }) as typeof fetch;
  try { await run(home, seen, fn => { reply = fn; }); }
  finally {
    globalThis.fetch = realFetch;
    if (before === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = before;
    await rm(home, { recursive: true, force: true });
  }
}

const call = (audience = "agent") => ({ signal: new AbortController().signal, audience, beforeEffect: async () => {} });
const connect = (home: string, serviceId: string, token: string) =>
  withConnectorConnections(home, store => store.createToken({ serviceId, displayName: serviceId, token }).connection_id);

test("ASC-54: the search sources come from declarations, and the built-in source is the default until the person picks another", async () => {
  await withHome(async home => {
    const directory = await homeConnectorDirectory(home);
    const searchServices = directory.filter(entry => entry.uses?.includes("web_search")).map(entry => entry.connector_id).sort();
    assert.deepEqual(searchServices, ["brave-search", "deepseek-search", "tavily"], "only services declaring a web_search integration are search sources");
    assert.ok(directory.find(entry => entry.connector_id === "linear")?.uses?.includes("category"), "a declared category is a use");
    assert.deepEqual(directory.find(entry => entry.connector_id === "linear")?.categories, ["project-tracker"]);
    const settings = await webSearchSettings(home);
    assert.equal(settings.default_source, WEB_SEARCH_BUILTIN_SOURCE);
    assert.equal(settings.default_unusable, false);
    assert.deepEqual(settings.sources.filter(source => source.kind === "service").map(source => source.state), ["not_connected", "not_connected", "not_connected"]);
    await assert.rejects(setWebSearchDefault(home, "service:tavily", async () => {}), { code: "web_search.source_unknown" }, "a service with no account cannot be the default");
  });
});

test("ASC-54: a connected Tavily account made the default answers the search, which names the source it used", async () => {
  await withHome(async (home, seen, answer) => {
    const id = connect(home, "tavily", "tvly-test-key");
    answer(() => Response.json({ results: [{ title: "Molis", url: "https://example.com/molis", content: "A local-first workbench", published_date: "2026-11-01" },
      { title: "no address", url: "javascript:alert(1)", content: "dropped" }] }));
    const settings = await setWebSearchDefault(home, id, async () => {});
    assert.equal(settings.default_source, id);
    const result = await runWebSearch(home, { query: "molis work", count: 3 }, call());
    assert.equal(result.source.source_id, id);
    assert.equal(result.source.service_id, "tavily");
    assert.deepEqual(result.results, [{ title: "Molis", url: "https://example.com/molis", snippet: "A local-first workbench", published: "2026-11-01" }],
      "results keep their address; a result without a web address is dropped");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.url, "https://api.tavily.com/search");
    assert.equal(seen[0]!.headers.authorization, "Bearer tvly-test-key");
    assert.deepEqual(seen[0]!.body, { query: "molis work", max_results: 3, search_depth: "basic" });
    const after = await webSearchSettings(home);
    assert.equal(after.last_use?.source_id, id);
    assert.equal(after.last_use?.audience, "agent");
    // Reloading reads the same default: it is the Home's, not a page's.
    assert.equal((await webSearchSettings(home)).default_source, id);
  });
});

test("Brave and DeepSeek are asked the way their own APIs say", async () => {
  await withHome(async (home, seen, answer) => {
    const brave = connect(home, "brave-search", "BSA-test-key");
    const deepseek = connect(home, "deepseek-search", "sk-test-key");
    answer(entry => entry.url.startsWith("https://api.search.brave.com")
      ? Response.json({ web: { results: [{ title: "B", url: "https://b.example/", description: "brave", meta_url: { hostname: "b.example" } }] } })
      : Response.json({ results: [{ title: "D", url: "https://d.example/", snippet: "deepseek", site_name: "D site", date: "2026-11-10" }] }));
    await setWebSearchDefault(home, brave, async () => {});
    const fromBrave = await runWebSearch(home, { query: "molis" }, call("user"));
    assert.equal(seen[0]!.headers["x-subscription-token"], "BSA-test-key");
    assert.equal(seen[0]!.headers.authorization, undefined, "Brave's key goes only in its own header");
    assert.equal(new URL(seen[0]!.url).searchParams.get("count"), "5");
    assert.deepEqual(fromBrave.results, [{ title: "B", url: "https://b.example/", snippet: "brave", site: "b.example" }]);
    await setWebSearchDefault(home, deepseek, async () => {});
    const fromDeepSeek = await runWebSearch(home, { query: "molis", count: 2 }, call("user"));
    assert.equal(seen[1]!.url, "https://api.deepseek.com/v1/tools/search");
    assert.equal(seen[1]!.method, "POST");
    assert.deepEqual(seen[1]!.body, { query: "molis", count: 2 });
    assert.deepEqual(fromDeepSeek.results, [{ title: "D", url: "https://d.example/", snippet: "deepseek", site: "D site", published: "2026-11-10" }]);
  });
});

test("ASC-55: a default that cannot be used stops the search with its reason; nothing is sent and the default is not swapped", async () => {
  await withHome(async (home, seen) => {
    const id = connect(home, "tavily", "tvly-test-key");
    await setWebSearchDefault(home, id, async () => {});
    withConnectorConnections(home, store => store.setEnabled(id, false));
    const settings = await webSearchSettings(home);
    assert.equal(settings.default_source, id);
    assert.equal(settings.default_unusable, true);
    await assert.rejects(runWebSearch(home, { query: "molis" }, call()), { code: "web_search.source_unusable" });
    assert.equal(seen.length, 0, "no request leaves for a disabled default, and no other source is asked");
    await assert.rejects(setWebSearchDefault(home, id, async () => {}), { code: "web_search.source_unusable" }, "a disabled account cannot be made the default");
    withConnectorConnections(home, store => store.remove(id));
    assert.equal((await webSearchSettings(home)).default_source, id, "a removed default stays named, and searches keep stopping");
    await assert.rejects(runWebSearch(home, { query: "molis" }, call()), { code: "web_search.source_unusable" });
    assert.equal((await setWebSearchDefault(home, WEB_SEARCH_BUILTIN_SOURCE, async () => {})).default_unusable, false, "picking another source repairs it");
  });
});

test("ASC-55: the service's refusals are told apart, and a search under way keeps the source it started with", async () => {
  await withHome(async (home, _seen, answer) => {
    const id = connect(home, "tavily", "tvly-test-key");
    await setWebSearchDefault(home, id, async () => {});
    answer(() => new Response("{}", { status: 401 }));
    await assert.rejects(runWebSearch(home, { query: "molis" }, call()), { code: "web_search.needs_auth" });
    answer(() => new Response("{}", { status: 429, headers: { "retry-after": "30" } }));
    await assert.rejects(runWebSearch(home, { query: "molis" }, call()), { code: "web_search.rate_limited" });
    answer(() => new Response("{}", { status: 402 }));
    await assert.rejects(runWebSearch(home, { query: "molis" }, call()), /余额不足/u);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    answer(async () => { await gate; return Response.json({ results: [{ title: "T", url: "https://t.example/", content: "t" }] }); });
    const running = runWebSearch(home, { query: "molis" }, call());
    await new Promise(resolve => setTimeout(resolve, 20));
    await setWebSearchDefault(home, WEB_SEARCH_BUILTIN_SOURCE, async () => {});
    release();
    const result = await running;
    assert.equal(result.source.source_id, id, "the search reports the source it actually used");
    assert.equal((await webSearchSettings(home)).default_source, WEB_SEARCH_BUILTIN_SOURCE, "and the new default stands for later searches");
  });
});

test("ASC-55: an account changed while its search is out is not reported as the search's result", async () => {
  await withHome(async (home, _seen, answer) => {
    const id = connect(home, "tavily", "tvly-test-key");
    await setWebSearchDefault(home, id, async () => {});
    answer(async () => {
      withConnectorConnections(home, store => store.replaceToken(id, "tvly-other-key"));
      return Response.json({ results: [{ title: "T", url: "https://t.example/", content: "t" }] });
    });
    await assert.rejects(runWebSearch(home, { query: "molis" }, call()), { code: "web_search.changed" });
  });
});
