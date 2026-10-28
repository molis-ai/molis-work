// W6-02 rest (specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md; RAC-1200, RAC-1201): the lifecycle walk of
// tests/fixtures/shipped-lifecycle.ts, for the two plugins the C line moved onto Plugin Runtime (BL-805): Feed and Inbox, each on a
// project's supervisor. Feed's project half keeps the sources the person registers; a source made through Feed's own route is read
// back from its snapshot through removal from the project and adding back, a revoked required permission and its return, and an
// upgrade. Inbox keeps nothing of its own that a person writes through its routes, so after the write its list is still empty — that
// is not a retention proof (w6-02 line 17); what the walk holds is that it starts, refuses nothing it should answer, and that the
// revocation, the upgrade, the uninstall and the restart each hold.
import test from "node:test";
import { walk, type Shipped } from "./fixtures/shipped-lifecycle.js";

/** The title name the source is registered with; `titles` keeps the list to what this walk wrote, whatever else a Home may hold. */
const written = "first";

const LIFECYCLE: Record<string, Shipped> = {
  feed: { key: "feed", plugin_id: "io.molis.work.feed", scope: "project", joins: true, stops_when_removed: true,
    write: (web, routes, title) => web.post(`${routes}/sources`, { kind: "custom_rss", name: title, feed_url: "https://example.com/feed.xml" }),
    titles: async (web, routes) => (await web.get<{ sources: Array<{ name: string }> }>(`${routes}/snapshot`)).sources
      .map(source => source.name).filter(name => name.startsWith(written) || name.endsWith(written)) },
  // Nothing of Inbox's own is written by the person here: its entries come from Feed's messages and source faults, so the walk writes
  // nothing and reads the empty list it still answers with.
  inbox: { key: "inbox", plugin_id: "io.molis.work.inbox", scope: "project", joins: true, stops_when_removed: true, kept: [],
    write: async () => undefined,
    titles: async (web, routes) => (await web.get<{ entries: Array<{ entry_id: string }> }>(`${routes}/entries`)).entries.map(entry => entry.entry_id),
  },
};

const walked = "added, removed and added back in a project, revoked, upgraded and uninstalled";
test(`RAC-1200 W6-02 Feed on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(LIFECYCLE.feed!));
test(`RAC-1201 W6-02 Inbox on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(LIFECYCLE.inbox!));
