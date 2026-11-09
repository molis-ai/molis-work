import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { defineSubjectContextAction, type ActionDefinition, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationValuesAction, type OwnedPresentationObject, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import * as design from "@molis-ai/molis-work-design-system";
import * as ui from "@molis-ai/molis-work-plugin-sdk/ui";
import { SurfaceCompositionService } from "@molis-ai/molis-work-service-surfaces";

const owner = "io.example.notes";
const plugin = { name: "Notes & ideas", icon: "note", hue: "mint" } as const;
const subject = { id: "internal-subject-id", kind: "note" };
const at = "2026-11-08T17:40:00Z";
const values = {
  title: "R&D <draft>", status: "waiting", summary: "First & second", excerpt: "<img src=x>",
  media: "draft.pdf", count: 12345.6, progress: 60, due: "2026-11-08", happened: at, updated: at,
  actor: "Ava", activity: { key: "notes.item.activity", args: [{ name: "actor", kind: "text", text: "A&B" }] },
  origin: "Customer email", version: "v2", relation: "Pricing", children: ["Phone", "Tablet"],
  judgment: { label: { key: "notes.item.verdict" }, reason: { literal: "Reason <read>" } }, where: "personal",
  hidden: "not-declared-secret",
};
const object: OwnedPresentationObject = {
  owner, kind: subject.kind,
  fields: [
    { key: "title", role: "title" }, { key: "status", role: "status" }, { key: "summary", role: "summary" }, { key: "excerpt", role: "excerpt" },
    { key: "media", role: "media" }, { key: "count", role: "number", label: { key: "notes.item.total" } }, { key: "progress", role: "progress" },
    { key: "due", role: "due_at" }, { key: "happened", role: "happened_at" }, { key: "updated", role: "updated_at" },
    { key: "actor", role: "actor" }, { key: "activity", role: "activity" }, { key: "origin", role: "origin" }, { key: "version", role: "version" },
    { key: "relation", role: "relation" }, { key: "children", role: "children" }, { key: "judgment", role: "judgment" }, { key: "where", role: "held_in" },
  ],
  status: { field: "status", map: { waiting: { ring: "answer", attention: "needs_decision" } } },
  forms: {
    chip: { fields: ["title"] },
    row: { fields: ["title", "count", "due", "actor", "activity", "where"] },
    card: { fields: ["title", "summary", "progress"] },
    peek: { fields: ["title", "summary", "excerpt", "media", "count", "progress", "due", "happened", "updated", "actor", "activity", "origin", "version", "relation", "children", "judgment", "where"] },
  },
};
const ownerWords = {
  "notes.item.activity": "Read by {actor}", "notes.item.verdict": "Verified", "notes.item.total": "Total",
};
const platform = ["zh", "en"].map(locale => {
  const pack = ui.parseLocalePack(readFileSync(new URL(`../apps/workbench/resources/locales/${locale}.json`, import.meta.url), "utf8"));
  if (!pack.ok) throw new Error(`Invalid workbench words: ${JSON.stringify(pack.problems)}`);
  return pack.value;
});
const packs: UiLocalePack[] = [
  { owner, locale: "de", format_version: 1, messages: ownerWords },
  { owner, locale: "en", format_version: 1, messages: ownerWords },
  ...platform,
];
const textScope = (context: TestContext) =>
  context.after(ui.installTextForTest({ packs, locale: "zh" }));
const current: PresentationValueItem = { subject, revision: "private-revision-id", state: "ok", values };
const display = { ownerDisplay: plugin, locale: "en", read: current } as const;

test("SSC-14: the real composition row and a direct owner values read use the same declaration and renderer", async t => {
  textScope(t);
  const view = (definition: ActionDefinition): ActionView => ({ ...definition,
    provider: { provider_id: "private-provider-id", plugin_install_id: "notes-install", plugin_id: owner, title: "Notes", kind: "plugin", project_id: "test" },
    availability: { available: true },
  });
  const service = new SurfaceCompositionService();
  const result = await service.compose({ slot: { kind: "plugin-slot", plugin_id: owner, slot_id: "results" }, subjects: [subject] }, {
    caller: { actor_id: "local", project_id: "test", audience: "user" },
    catalog: () => [{ plugin_id: owner, install_id: "notes-install", revision: "1", state: "running", scope: "project",
      slots: [{ slot_id: "results", accepts: [], accepts_forms: ["row"], max: 1 }], presentation: { objects: [object] } }],
    discover: () => [view(defineSubjectContextAction("notes.read", 1, subject.kind, "Read", [])), view(definePresentationValuesAction("notes.values", 1, [subject.kind], "Values", []))],
    values: async (_action, input) => ({ items: [{ ...current, values: Object.fromEntries(input.fields.map(key => [key, values[key as keyof typeof values]])) }] }),
    attention: () => [], relations: () => [], current: () => undefined, beforeEffect: async () => undefined, retain: () => () => undefined,
    corrections: { read: () => ({ revision: "0", corrections: [] }), correct: async () => { throw new Error("Unexpected write"); } },
  });
  const item = result.groups[0]?.items[0];
  assert.equal(item?.form, "row");
  assert.deepEqual(item.fields.map(field => field.key), ["title", "count", "due", "actor", "activity", "where", "status"]);
  const projection = { ...display, read: { state: item.state, values: Object.fromEntries(item.fields.map(({ key }) => [key, values[key as keyof typeof values]])) } };
  const direct = ui.renderPresentationForm(object, "row", display);
  assert.equal(ui.renderPresentationForm(object, item.form, projection), direct);
  assert.match(direct, /R&amp;D &lt;draft&gt;.*Needs your decision.*12,345\.6/u);
  assert.doesNotMatch(direct, /First &amp; second|not-declared-secret|private-provider-id|internal-subject-id|private-revision-id/u);
  assert.equal(ui.renderPresentationForm({ ...object, forms: { row: object.forms.row } }, "peek", display), direct);
});

test("IUI-10: denied, deleted and invalid stale reads never read the object, values, actions or notices", t => {
  textScope(t);
  const never = () => { throw new Error("A protected value was read"); };
  for (const [state, label] of [
    ["forbidden", "You do not have permission to view this"],
    ["deleted", "Deleted"],
    ["unreadable", "Cannot read this right now"],
    ["stale", "Cannot read this right now"],
  ] as const) {
    const read = { state, read_at: state === "stale" ? "2026-02-30" : undefined, get values(): never { return never(); } };
    const protectedObject = new Proxy(object, { get: never });
    const view = { ...display, read, get actions(): never { return never(); }, get notices(): never { return never(); } };
    for (const form of ["chip", "row", "card", "peek"] as const) {
      const html = ui.renderPresentationForm(protectedObject, form, view);
      assert.ok(html.includes(label), html);
      assert.match(html, /Notes &amp; ideas/u);
      assert.doesNotMatch(html, /<button|<summary|<time|data-presentation-action/u);
    }
  }
  const stale = ui.renderPresentationForm(object, "card", { ...display, read: { ...current, state: "stale", read_at: at },
    actions: [{ key: "local-open", label: "Open" }],
  });
  assert.match(stale, /datetime="2026-11-08T17:40:00Z".*These values were read.*R&amp;D &lt;draft&gt;/u);
  assert.match(stale, /data-presentation-action="local-open"/u);
});

test("IUI-08 IUI-26: each role, action consequence and owner-bound notice uses one HTML boundary", t => {
  textScope(t);
  const actions = [
    { key: 'review"&<key>', label: "Review <draft>", primary: true, consequence: ["external", "irreversible"] },
    { key: "retry", label: "Review retry", consequence: ["cost"] },
  ] as const;
  const projection = { ...display, actions, notices: [{ reason: { literal: "Still & <locked>" }, next: { key: "show", label: "Read only" } }] };
  const html = ui.renderPresentationForm(object, "peek", projection);
  for (const expected of [
    "R&amp;D &lt;draft&gt;", "First &amp; second", "&lt;img src=x&gt;", "draft.pdf", "Total", "12,345.6", 'aria-valuenow="60"', "Nov 8, 2026",
    "Ava", "Read by A&amp;B", "Customer email", "v2", "Pricing", "<li>Phone</li><li>Tablet</li>", "Verified", "Reason &lt;read&gt;", "Personal",
    'data-presentation-action="review&quot;&amp;&lt;key&gt;"', "Review &lt;draft&gt;", "Sends information outside Molis Work", "This cannot be undone",
    "May incur a charge", "Still &amp; &lt;locked&gt;", 'data-presentation-action="show"',
  ]) assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html, /<img|&amp;lt;|not-declared-secret|<a |https?:/u);
  const row = ui.renderPresentationForm(object, "row", projection);
  assert.match(row, /More actions.*role="menu".*data-presentation-action="retry".*May incur a charge/u);
  const chip = ui.renderPresentationForm(object, "chip", display);
  assert.doesNotMatch(chip, /<button|data-presentation-action|First &amp; second/u);
  assert.equal(ui.renderPresentationForm({ ...object, forms: {} }, "row", display), "");
});

test("IUI-26: explicit locale overrides the page and null uses the owner's own default for dates and numbers", t => {
  textScope(t);
  const german = ui.renderPresentationForm(object, "row", { ...display, locale: null });
  const english = ui.renderPresentationForm(object, "row", display);
  assert.match(german, /12\.345,6.*08\.11\.2026/u);
  assert.match(english, /12,345\.6.*Nov 8, 2026/u);
  const foreign = ui.renderPresentationForm(object, "row", { ...display, read: { ...current, values: { ...values, activity: { key: "foreign.item.private" } } } });
  assert.match(foreign, /This text cannot be shown right now/u);
  assert.doesNotMatch(foreign, /foreign\.item\.private/u);
});

test("IUI-21: the original design-system entry points use the exact SDK primitives", () => {
  for (const name of ["renderPreviewCard", "renderPopover", "renderSheet", "renderMenu", "renderMenuItem"] as const) {
    assert.strictEqual(design[name], ui[name], name);
  }
});
