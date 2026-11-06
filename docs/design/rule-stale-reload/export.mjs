// Writes the product's own markup for the two pages this prototype draws on, into ./dist/ (generated, not committed):
// the rule editor from renderFunctionsWorkbench and Feed's rule composer from renderFeedWorkbench, in both languages through
// the product's own English dictionary, plus Feed's stylesheet. Nothing here is copied by hand; rerun after the pages change.
//
//   pnpm build
//   node docs/design/_catalog/export.mjs
//   node docs/design/rule-stale-reload/export.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const load = (path) => import(pathToFileURL(join(root, path)).href);

const { renderFunctionsWorkbench } = await load("apps/workbench/dist/judgment-rules/ui.js");
const { EN } = await load("apps/workbench/dist/i18n/en.js");
const { renderFeedWorkbench } = await load("plugins/native/feed/dist/ui.js");
const { FEED_STYLES } = await load("plugins/native/feed/dist/styles.js");
const { icon } = await load("packages/plugin-sdk/dist/ui/icon.js");
const feedEnglish = await load("plugins/native/feed/dist/en.js");
const FEED_EN = Object.values(feedEnglish).find((value) => value && typeof value === "object") ?? {};

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// The dictionary's two placeholder forms: {name} and {count|one|many}.
const fill = (text, values = {}) => text
  .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, key, one, many) => (Number(values[key]) === 1 ? one : many))
  .replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
const textOf = (lang) => (value, values) => fill(lang === "en" ? FEED_EN[value] ?? EN[value] ?? value : value, values);

// A source with one existing capture rule: sample data, only here so Feed's own renderer has something to draw.
const source = (lang) => {
  const zh = lang === "zh";
  return {
    source_id: "s1", name: zh ? "客服邮箱" : "Support inbox", kind: "rss", account_label: "", description: "", config: {}, schedule: { mode: "interval", interval_minutes: 60 },
    item_count: 128, ui_kind: "rss", type_label: "RSS", status_kind: "active", status_label: zh ? "运行正常" : "Running", last_fetch_label: zh ? "5 分钟前" : "5 min ago", next_fetch_label: "", schedule_label: "",
    scope_label: "", scope_options: [], configured_endpoint: "https://example.com/feed.xml", protocol_status: null, home_url: null, editable_endpoint: true, messages: [], runs: [],
  };
};
const feedModel = (lang) => {
  const zh = lang === "zh";
  const text = textOf(lang);
  return {
    route_prefix: "/projects/demo", preset: "feed", entries: [], sources: [source(lang)], source_catalog: [], connector_auth: { github: { bound: false }, gmail: { bound: false } }, active: true,
    out_rules: [{ rule_id: "r1", name: zh ? "付款问题" : "Payment issues", enabled: true, contains: zh ? "付款" : "payment", source_id: "s1", source_kind: "rss", judgment: null, admission: "suggest" }],
    primitives: { escape, icon: (name) => icon(name), text, formatDate: (v) => v, richText: (v) => escape(v ?? ""), plainText: (v) => v ?? "", safeExternalHref: () => null },
  };
};

const fragments = {};
for (const lang of ["zh", "en"]) {
  const text = textOf(lang);
  fragments[lang] = {
    editor: renderFunctionsWorkbench({ primitives: { escape, text } }),
    feed: renderFeedWorkbench(feedModel(lang)),
  };
}

const out = join(here, "dist");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "feed.css"), FEED_STYLES);
writeFileSync(join(out, "fragments.js"), `window.RULE_FRAGMENTS = ${JSON.stringify(fragments)};\n`);
process.stdout.write(`feed.css ${(FEED_STYLES.length / 1024).toFixed(0)} KB, fragments.js ${(JSON.stringify(fragments).length / 1024).toFixed(0)} KB\n`);
