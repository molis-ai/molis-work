import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, homeConnectorDirectory, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { WEB_SEARCH_BUILTIN_SOURCE, type WebSearchSettingsView, type WebSearchQueryResponse } from "@molis-ai/molis-work-contracts/services/web-search";

/**
 * The default web search source (specs/assistant-service-connections §13.7; ASC-54, ASC-55). The three search services are reached
 * through a fake `fetch`: the user decided 2026-11-18 to test them against fakes, real keys later in an isolated Home.
 */
type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };

function searchActions(host: MolisWorkLocalHost) {
  const client = host.homeActionClient();
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user" as const, permissions: ["web_search:query", "web_search:manage"] };
  return {
    settings: () => client.invoke(person, { capability_id: "connectors.web_search.sources", version: 1 }, {}) as Promise<WebSearchSettingsView>,
    choose: (source_id: string) => client.invoke(person, { capability_id: "connectors.web_search.default.set", version: 1 }, { source_id }) as Promise<WebSearchSettingsView>,
    query: (input: { query: string; count?: number }, audience: ActionAudience = "agent", assert_authority_current?: () => void) =>
      client.invoke({ ...person, audience, assert_authority_current }, { capability_id: "connectors.web_search.query", version: 1 }, input) as Promise<WebSearchQueryResponse>,
  };
}

async function withHome(run: (home: string, seen: Seen[], answer: (fn: (seen: Seen) => Response | Promise<Response>) => void, search: ReturnType<typeof searchActions>) => Promise<void>) {
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

  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try { await run(home, seen, fn => { reply = fn; }, searchActions(host)); }
  finally {
    await host.close();
    globalThis.fetch = realFetch;
    if (before === undefined) delete process.env.MOLIS_WORK_HOME; else process.env.MOLIS_WORK_HOME = before;
    await rm(home, { recursive: true, force: true });
  }
}

const connect = (home: string, serviceId: string, token: string) =>
  withConnectorConnections(home, store => store.createToken({ serviceId, displayName: serviceId, token }).connection_id);

test("ASC-54: the search sources come from declarations, and the built-in source is the default until the person picks another", async () => {
  await withHome(async (home, _seen, _answer, search) => {
    const directory = await homeConnectorDirectory(home);
    const searchServices = directory.filter(entry => entry.uses?.includes("web_search")).map(entry => entry.connector_id).sort();
    assert.deepEqual(searchServices, ["brave-search", "deepseek-search", "tavily"], "only services declaring a web_search integration are search sources");
    assert.ok(directory.find(entry => entry.connector_id === "linear")?.uses?.includes("category"), "a declared category is a use");
    assert.deepEqual(directory.find(entry => entry.connector_id === "linear")?.categories, ["project-tracker"]);
    const settings = await search.settings();
    assert.equal(settings.default_source, WEB_SEARCH_BUILTIN_SOURCE);
    assert.equal(settings.default_unusable, false);
    assert.deepEqual(settings.sources.filter(source => source.kind === "service").map(source => source.state), ["not_connected", "not_connected", "not_connected"]);
    await assert.rejects(search.choose("service:tavily"), { code: "connector.web_search.source_unknown" }, "a service with no account cannot be the default");
  });
});

test("ASC-54 SCAF-07: a chosen Tavily account answers the search and the result names that account", async () => {
  await withHome(async (home, seen, answer, search) => {
    const [id, other] = withConnectorConnections(home, store => ["Research", "Personal"].map(displayName =>
      store.createToken({ serviceId: "tavily", displayName, token: displayName === "Research" ? "tvly-test-key" : "tvly-other" }).connection_id));
    answer(() => Response.json({ results: [{ title: "Molis", url: "https://example.com/molis", content: "A local-first workbench", published_date: "2026-11-01" },
      { title: "no address", url: "javascript:alert(1)", content: "dropped" }] }));
    const settings = await search.choose(id);
    assert.equal(settings.default_source, id);
    assert.equal(settings.sources.find(source => source.source_id === other)?.account_label, "Personal");
    const result = await search.query({ query: "molis work", count: 3 });
    assert.equal(result.source.source_id, id);
    assert.equal(result.source.service_id, "tavily");
    assert.equal(result.source.account_label, "Research");
    assert.deepEqual(result.results, [{ title: "Molis", url: "https://example.com/molis", snippet: "A local-first workbench", published: "2026-11-01" }],
      "results keep their address; a result without a web address is dropped");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.url, "https://api.tavily.com/search");
    assert.equal(seen[0]!.headers.authorization, "Bearer tvly-test-key");
    assert.deepEqual(seen[0]!.body, { query: "molis work", max_results: 3, search_depth: "basic" });
    const after = await search.settings();
    assert.equal(after.last_use?.source_id, id);
    assert.equal(after.last_use?.audience, "agent");
    // Reloading reads the same default: it is the Home's, not a page's.
    assert.equal((await search.settings()).default_source, id);
    // A search cancelled or no longer allowed by the time the answer comes writes nothing: the last use stays the earlier one.
    const asked = seen.length;
    const stopped = () => { if (seen.length > asked) throw new ActionError("actions.cancelled", "cancelled"); };
    await assert.rejects(search.query({ query: "molis again" }, "user", stopped), { code: "actions.cancelled" }, "said as stopped, not as a network failure");
    const kept = (await search.settings()).last_use;
    assert.equal(seen.length, asked + 1, "the service answered before the call was stopped");
    assert.deepEqual([kept?.used_at, kept?.audience], [after.last_use?.used_at, "agent"], "a cancelled search leaves no record");
  });
});

test("Brave and DeepSeek are asked the way their own APIs say", async () => {
  await withHome(async (home, seen, answer, search) => {
    const brave = connect(home, "brave-search", "BSA-test-key");
    const deepseek = connect(home, "deepseek-search", "sk-test-key");
    answer(entry => entry.url.startsWith("https://api.search.brave.com")
      ? Response.json({ web: { results: [{ title: "B", url: "https://b.example/", description: "brave", meta_url: { hostname: "b.example" } }] } })
      : Response.json({ results: [{ title: "D", url: "https://d.example/", snippet: "deepseek", site_name: "D site", date: "2026-11-10" }] }));
    await search.choose(brave);
    const fromBrave = await search.query({ query: "molis" }, "user");
    assert.equal(seen[0]!.headers["x-subscription-token"], "BSA-test-key");
    assert.equal(seen[0]!.headers.authorization, undefined, "Brave's key goes only in its own header");
    assert.equal(new URL(seen[0]!.url).searchParams.get("count"), "5");
    assert.deepEqual(fromBrave.results, [{ title: "B", url: "https://b.example/", snippet: "brave", site: "b.example" }]);
    await search.choose(deepseek);
    const fromDeepSeek = await search.query({ query: "molis", count: 2 }, "user");
    assert.equal(seen[1]!.url, "https://api.deepseek.com/v1/tools/search");
    assert.equal(seen[1]!.method, "POST");
    assert.deepEqual(seen[1]!.body, { query: "molis", count: 2 });
    assert.deepEqual(fromDeepSeek.results, [{ title: "D", url: "https://d.example/", snippet: "deepseek", site: "D site", published: "2026-11-10" }]);
  });
});

test("ASC-55: a default that cannot be used stops the search with its reason; nothing is sent and the default is not swapped", async () => {
  await withHome(async (home, seen, _answer, search) => {
    const id = connect(home, "tavily", "tvly-test-key");
    await search.choose(id);
    withConnectorConnections(home, store => store.setEnabled(id, false));
    const settings = await search.settings();
    assert.equal(settings.default_source, id);
    assert.equal(settings.default_unusable, true);
    await assert.rejects(search.query({ query: "molis" }), { code: "connector.web_search.source_unusable" });
    assert.equal(seen.length, 0, "no request leaves for a disabled default, and no other source is asked");
    await assert.rejects(search.choose(id), { code: "connector.web_search.source_unusable" }, "a disabled account cannot be made the default");
    withConnectorConnections(home, store => store.remove(id));
    assert.equal((await search.settings()).default_source, id, "a removed default stays named, and searches keep stopping");
    await assert.rejects(search.query({ query: "molis" }), { code: "connector.web_search.source_unusable" });
    assert.equal((await search.choose(WEB_SEARCH_BUILTIN_SOURCE)).default_unusable, false, "picking another source repairs it");
  });
});

test("ASC-55 SCAF-07: 401 marks a source as needing repair, and a search keeps the source it started with", async () => {
  await withHome(async (home, seen, answer, search) => {
    const id = connect(home, "tavily", "tvly-test-key");
    await search.choose(id);
    answer(() => new Response("{}", { status: 401 }));
    await assert.rejects(search.query({ query: "molis" }), { code: "connector.web_search.needs_auth" });
    const broken = await search.settings();
    assert.equal(broken.default_unusable, true);
    assert.equal(broken.default_source, id);
    assert.equal(broken.last_use, null);
    await assert.rejects(search.query({ query: "molis" }), { code: "connector.web_search.source_unusable" });
    assert.equal(seen.length, 1);
    withConnectorConnections(home, store => store.replaceToken(id, "tvly-replacement-key"));
    assert.equal((await search.settings()).default_unusable, false);
    answer(() => new Response("{}", { status: 429, headers: { "retry-after": "30" } }));
    await assert.rejects(search.query({ query: "molis" }), { code: "connector.web_search.rate_limited" });
    answer(() => new Response("{}", { status: 402 }));
    await assert.rejects(search.query({ query: "molis" }), /余额不足/u);
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    answer(async () => { entered.resolve(); await release.promise; return Response.json({ results: [{ title: "T", url: "https://t.example/", content: "t" }] }); });
    const running = search.query({ query: "molis" });
    try {
      await Promise.race([entered.promise, running.then(() => assert.fail("query completed before reaching the fake provider"))]);
      await search.choose(WEB_SEARCH_BUILTIN_SOURCE);
    } finally { release.resolve(); }
    const result = await running;
    assert.equal(result.source.source_id, id, "the search reports the source it actually used");
    assert.equal((await search.settings()).default_source, WEB_SEARCH_BUILTIN_SOURCE, "and the new default stands for later searches");
  });
});

test("SCAF-07: DeepSeek's query limit is checked in Unicode characters before dispatch", async () => {
  await withHome(async (home, seen, _answer, search) => {
    const id = connect(home, "deepseek-search", "deepseek-fixture");
    await search.choose(id);
    await search.query({ query: "🧭".repeat(128) });
    await assert.rejects(search.query({ query: "🧭".repeat(129) }), { code: "connector.web_search.query_invalid" });
    assert.equal(seen.length, 1);
  });
});

test("ASC-55: an account changed while its search is out is not reported as the search's result", async () => {
  await withHome(async (home, _seen, answer, search) => {
    const id = connect(home, "tavily", "tvly-test-key");
    await search.choose(id);
    answer(async () => {
      withConnectorConnections(home, store => store.replaceToken(id, "tvly-other-key"));
      return Response.json({ results: [{ title: "T", url: "https://t.example/", content: "t" }] });
    });
    await assert.rejects(search.query({ query: "molis" }), { code: "connector.web_search.changed" });
  });
});
