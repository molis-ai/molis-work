import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assertPageWords, withPageText } from "./fixtures/page-text.js";
import { PLUGIN_COMPONENTS, PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-design-system";
import {
  AGENT_STUDIO_CLIENT_FACTORY_SCRIPT, AGENT_STUDIO_STYLES, AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT,
  builderUiContribution, renderAgentStudio, renderStudioStage,
} from "@molis-ai/molis-work-plugin-builder";

// The plugin studio's own words go through the host translator, so the English interface shows English controls, labels, empty
// states, phases and pointer labels. What the build record carries (the model's answers, the host's step labels and errors)
// and the capability directory's titles are data and stay as written.

// The studio is the plugin builder's: its English is the plugin's own, applied as the studio's frame and contribution get it.
const studio = <T>(locale: "zh" | "en", draw: () => T) => withPageText(locale, ["plugin-builder"], draw);
const HAN = /\p{Script=Han}/u;

test("the studio stage in English has no Chinese label, aria-label or title, and the Chinese stage keeps its labels", () => {
  const html = studio("en", () => renderAgentStudio());
  assert.doesNotMatch(html, HAN, "every label of the studio is English");
  for (const fragment of [
    'aria-label="My plugins"', 'aria-label="New plugin" title="New plugin"', "<span>Model</span>", 'aria-label="Model used for building"', ">Open model settings</a>",
    'aria-label="Collaboration"', "<span>Apply changes to</span>", '<option value="message">Features and interface</option>', '<option value="visual">Interface only</option>',
    'aria-label="Describe or change"', 'aria-label="Send" title="Send"', "<h1 data-as-title>New plugin</h1>", 'aria-label="Canvas mode"', ">Build</button>", ">Try</button>",
    "<span>Code Agent</span>", 'aria-label="All components in the UI catalog"', 'aria-label="Spec board: components in the UI catalog"',
  ]) assert.ok(html.includes(fragment), `English stage has ${fragment}`);
  const zh = studio("zh", () => renderAgentStudio());
  for (const fragment of [
    'aria-label="我的插件"', 'aria-label="新建插件" title="新建插件"', "<span>模型</span>", 'aria-label="构建使用的模型"', ">打开模型设置</a>", 'aria-label="协作"', "<span>修改范围</span>",
    '<option value="message">功能与界面</option>', '<option value="visual">只调整界面</option>', 'aria-label="描述或修改"', 'aria-label="发送" title="发送"', "<h1 data-as-title>新插件</h1>",
    'aria-label="画布模式"', ">构建</button>", ">试用</button>", "<span>代码 Agent</span>", 'aria-label="UI 目录全部组件"', 'aria-label="规格板：UI 目录里的组件"',
  ]) assert.ok(zh.includes(fragment), `Chinese stage has ${fragment}`);
});

test("the studio contribution reads its own language in the workbench", () => {
  const request = () => builderUiContribution.render({ contribution_id: builderUiContribution.descriptor.contribution_id, surface: "workbench", model: null });
  assert.doesNotMatch(studio("en", request), HAN, "the stage and its wrapper are English");
  assert.match(studio("zh", request), /aria-label="新建插件"/u);
  const label = (html: string) => /<section [^>]*data-work-surface="plugin-builder"[^>]* data-work-surface-label="([^"]*)"/u.exec(html)?.[1];
  assert.equal(label(studio("en", () => renderStudioStage())), "Plugin Studio");
  assert.equal(label(studio("zh", () => renderStudioStage())), "插件创作工作台");
  assert.equal(label(studio("en", request)), "Plugin Studio");
});

test("the two badges the stylesheet draws on a part come from the stage as custom properties, in the interface language", () => {
  assert.doesNotMatch(AGENT_STUDIO_STYLES, HAN, "no Chinese is left in the stylesheet");
  assert.match(AGENT_STUDIO_STYLES, /\[data-live=false\]::before\{content:var\(--as-idle\);/u);
  assert.match(AGENT_STUDIO_STYLES, /\[data-as-wired\]::after\{content:var\(--as-wired\);/u);
  const style = (html: string) => /<section class="as-shell"[^>]* style="([^"]*)"/u.exec(html)?.[1];
  assert.equal(style(studio("en", () => renderAgentStudio())), "--as-idle:'Not connected yet';--as-wired:'✓ Connected'");
  assert.equal(style(studio("zh", () => renderAgentStudio())), "--as-idle:'功能待接通';--as-wired:'✓ 已接通'");
  // Whatever a translation holds cannot end the string or the attribute.
  const hostile = style(renderAgentStudio(() => `a'b"<c>&d\\e`))!;
  assert.doesNotMatch(hostile, /["<>&]/u);
  assert.match(hostile, /^--as-idle:'a\\27 b\\22 \\3c c\\3e \\26 d\\5c e';--as-wired:'✓ a\\27 b/u);
});

/** Read the real client literals; no runtime uses the old source-sentence translator. */
function literalsOf(script: string): string[] {
  const tree = ts.createSourceFile("studio-client.js", "(" + script + ")", ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

test("the Studio client and the shared component catalog use bilingual stable words", () => {
  const client = literalsOf(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT);
  const wrapper = AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT.replace(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT, "()=>{}").replace(PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, "{}");
  assert.deepEqual(client.filter(item => HAN.test(item)), ["版面", "展示", "录入", "操作", "浮层", "反馈"], "only the existing catalog group IDs are raw literals");
  assert.deepEqual(literalsOf(wrapper).filter(item => HAN.test(item)), []);
  const keys = [...new Set(client.filter(item => /^plugin-builder\.agent-studio\.[a-z0-9.-]+$|^common\.[a-z0-9.-]+$/u.test(item)))];
  assert.ok(keys.length > 150, "the client uses keys for its own UI sentences");
  assertPageWords("plugin-builder", keys);
  for (const component of PLUGIN_COMPONENTS) for (const ref of [component.name, component.description]) {
    assert.ok(typeof ref === "object" && "key" in ref, "the specification board and Studio read the same display reference");
    assertPageWords("plugin-builder", [ref.key]);
  }
});

test("an unfinished preview explains why it cannot be drawn in its current language", fixture => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "t");
  Object.defineProperty(globalThis, "t", { value: t, configurable: true });
  fixture.after(() => { if (previous) Object.defineProperty(globalThis, "t", previous); else Reflect.deleteProperty(globalThis, "t"); });
  const run = (locale: "zh" | "en") => studio(locale, () => {
    const root = { textContent: "", dataset: {}, matches: () => true };
    const lifetime = { alive: true, own: () => () => {} };
    const host = { mode: "preview", root, build: "draft", api: (path: string) => path,
      mountPluginClient: () => lifetime, components: () => ({ destroy: () => {} }) };
    (0, eval)(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT)(host);
    return root.textContent;
  });
  assert.equal(run("en"), "The draft has no selected design yet.");
  assert.equal(run("zh"), "草稿还未选定方案。");
});
