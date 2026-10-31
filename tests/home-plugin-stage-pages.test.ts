import assert from "node:assert/strict";
import test from "node:test";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { MolisWorkLocalHost, installedStageSection } from "@molis-ai/molis-work-app-local-host";
import { renderHomePluginNavigation } from "@molis-ai/molis-work-app-workbench";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

// BL-713 (PG-011; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §5, T-401): the parts of a Home package's stage that need
// no sandbox, so they run on Linux CI as well. `home-plugin-stage-navigation.test.ts` installs a signed package and runs it in the macOS
// sandbox, which only a Mac has.

/** The tool-bar entry a page draws for a package: the whole element, or none. */
const entryOf = (html: string, pluginId: string) => new RegExp(`<(a|button) [^>]*data-home-plugin-open="${pluginId.replaceAll(".", "\\.")}"[^>]*>.*?</\\1>`, "s").exec(html)?.[0];

test("RAC-2620.1 an installed stage is drawn with the string a project's agent plugin has always had, and the tool bar's entry is a link on the arrival page and a stage button in a project", () => {
  const pluginId = "io.molis.work.generated.00000000-0000-4000-8000-000000000000";
  assert.equal(installedStageSection({ pluginId, surface: "app-b1", label: "Notes & <Tasks>", prefix: "/projects/p" }),
    '<section class="desktop-work-surface pb-surface" data-work-surface="app-b1" data-work-surface-label="Notes &amp; &lt;Tasks&gt;" data-installed-plugin="' + pluginId + '" hidden>'
    + '<iframe src="/projects/p/plugins/' + pluginId + '?frame=workbench" title="Notes &amp; &lt;Tasks&gt;" loading="lazy" style="display:block;width:100%;height:100%;border:0;background:#fff"></iframe></section>');
  const installed = [
    { plugin_id: "io.molis.work.example.notes", name: "Notes <1>", surface: "io.molis.work.example.notes" },
    { plugin_id: "io.molis.work.example.books", name: "Books", icon: "book", surface: "io.molis.work.example.books" },
  ];
  const arrival = renderHomePluginNavigation(path => path, installed), inProject = renderHomePluginNavigation(undefined, installed);
  const notes = entryOf(arrival, "io.molis.work.example.notes")!, books = entryOf(arrival, "io.molis.work.example.books")!;
  assert.ok(notes.startsWith("<a ") && notes.includes('href="/plugins/io.molis.work.example.notes"') && !notes.includes("data-work-surface-open"), "a link to the package's page");
  assert.ok(notes.includes(icon("package")) && notes.includes("Notes &lt;1&gt;"), "the default icon, the name escaped");
  assert.ok(books.includes(icon("book")) && !books.includes(icon("package")), "the icon the package picked");
  const openStage = entryOf(inProject, "io.molis.work.example.books")!;
  assert.ok(openStage.startsWith("<button ") && openStage.includes('type="button"') && openStage.includes('data-work-surface-open="io.molis.work.example.books"') && !openStage.includes('href="/plugins/'), "a button that opens the stage, not a link");
});

test("RAC-2621.4 a page key nothing registers has no page, framed or not, even as the first request after a start; a built-in Home plugin's key frames no package", async t => {
  const first = await openTestHome(t);
  await first.close(); await first.host.close();
  const host = new MolisWorkLocalHost({ homeDirectory: first.home, completeText: null });
  const served = await serveTestHost(null, { home: first.home, host });
  try {
    for (const key of ["io.molis.work.example.absent", "io.molis.work.generated.00000000-0000-4000-8000-000000000000"]) {
      for (const query of ["", "?frame=workbench"]) {
        // The first of these is the first request this Host has served: it asks the Home to start and still answers 404.
        const response = await fetch(`${served.origin}/plugins/${key}${query}`);
        const text = await response.text();
        assert.equal(response.status, 404, `${key}${query}: there is no such page`);
        assert.ok(!text.includes('"mode":"installed"') && !text.includes("page_id"), `${key}${query}: no installed page and no page token is given out`);
      }
    }
    // A built-in Home plugin answers with its own page, which has its own page token and frames no package.
    const builtin = await (await fetch(`${served.origin}/plugins/todo?frame=workbench`)).text();
    assert.ok(!builtin.includes('"mode":"installed"') && !builtin.includes("?frame=workbench"), "the answer is not an installed package's page");
  } finally { await served.close(); await host.close(); }
});
