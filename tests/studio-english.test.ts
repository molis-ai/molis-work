import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { pageText } from "./fixtures/page-text.js";
import { PLUGIN_COMPONENTS, PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-design-system";
import {
  AGENT_STUDIO_CLIENT_FACTORY_SCRIPT, AGENT_STUDIO_STYLES, AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT,
  builderUiContribution, renderAgentStudio, renderStudioStage,
} from "@molis-ai/molis-work-plugin-builder";

// The plugin studio's own words go through the host translator, so the English interface shows English controls, labels, empty
// states, phases and pointer labels. What the build record carries (the model's answers, the host's step labels and errors)
// and the capability directory's titles are data and stay as written.

// The studio is the plugin builder's: its English is the plugin's own, applied as the studio's frame and contribution get it.
const english = pageText("en", "plugin-builder"), chinese = pageText("zh");
const HAN = /\p{Script=Han}/u;

test("the studio stage in English has no Chinese label, aria-label or title, and the Chinese stage keeps its labels", () => {
  const html = renderAgentStudio(english);
  assert.doesNotMatch(html, HAN, "every label of the studio is English");
  for (const fragment of [
    'aria-label="My plugins"', 'aria-label="New plugin" title="New plugin"', "<span>Model</span>", 'aria-label="Model used for building"', ">Open model settings</a>",
    'aria-label="Collaboration"', "<span>Apply changes to</span>", '<option value="message">Features and interface</option>', '<option value="visual">Interface only</option>',
    'aria-label="Describe or change"', 'aria-label="Send" title="Send"', "<h1 data-as-title>New plugin</h1>", 'aria-label="Canvas mode"', ">Build</button>", ">Try</button>",
    "<span>Code Agent</span>", 'aria-label="All components in the UI catalog"', 'aria-label="Spec board: components in the UI catalog"',
  ]) assert.ok(html.includes(fragment), `English stage has ${fragment}`);
  const zh = renderAgentStudio(chinese);
  assert.equal(zh, renderAgentStudio(), "without a translator the stage is the Chinese text, the same as in the Chinese interface");
  for (const fragment of [
    'aria-label="我的插件"', 'aria-label="新建插件" title="新建插件"', "<span>模型</span>", 'aria-label="构建使用的模型"', ">打开模型设置</a>", 'aria-label="协作"', "<span>修改范围</span>",
    '<option value="message">功能与界面</option>', '<option value="visual">只调整界面</option>', 'aria-label="描述或修改"', 'aria-label="发送" title="发送"', "<h1 data-as-title>新插件</h1>",
    'aria-label="画布模式"', ">构建</button>", ">试用</button>", "<span>代码 Agent</span>", 'aria-label="UI 目录全部组件"', 'aria-label="规格板：UI 目录里的组件"',
  ]) assert.ok(zh.includes(fragment), `Chinese stage has ${fragment}`);
});

test("the studio's UI contribution renders English labels when its model carries the host translator", () => {
  const request = (model: Parameters<typeof builderUiContribution.render>[0]["model"]) => builderUiContribution.render({ contribution_id: builderUiContribution.descriptor.contribution_id, surface: "workbench", model });
  assert.doesNotMatch(request({ primitives: { text: english } }), HAN, "the stage, its wrapper's label included, is English");
  assert.match(request(null), /aria-label="新建插件"/u, "a developer fixture renders with no model");
  assert.doesNotMatch(renderStudioStage(english), HAN);
  // The workbench copies the wrapper's label into the pane's aria-label while the studio is the open surface.
  const label = (html: string) => /<section [^>]*data-work-surface="plugin-builder"[^>]* data-work-surface-label="([^"]*)"/u.exec(html)?.[1];
  assert.equal(label(renderStudioStage(english)), "Plugin Studio");
  assert.equal(label(renderStudioStage(chinese)), "插件创作工作台");
  assert.equal(label(renderStudioStage()), "插件创作工作台", "without a translator it is the Chinese text");
  assert.equal(label(request({ primitives: { text: english } })), "Plugin Studio");
});

test("the two badges the stylesheet draws on a part come from the stage as custom properties, in the interface language", () => {
  assert.doesNotMatch(AGENT_STUDIO_STYLES, HAN, "no Chinese is left in the stylesheet");
  assert.match(AGENT_STUDIO_STYLES, /\[data-live=false\]::before\{content:var\(--as-idle\);/u);
  assert.match(AGENT_STUDIO_STYLES, /\[data-as-wired\]::after\{content:var\(--as-wired\);/u);
  const style = (html: string) => /<section class="as-shell"[^>]* style="([^"]*)"/u.exec(html)?.[1];
  assert.equal(style(renderAgentStudio(english)), "--as-idle:'Not connected yet';--as-wired:'✓ Connected'");
  assert.equal(style(renderAgentStudio()), "--as-idle:'功能待接通';--as-wired:'✓ 已接通'");
  // Whatever a translation holds cannot end the string or the attribute.
  const hostile = style(renderAgentStudio(() => `a'b"<c>&d\\e`))!;
  assert.doesNotMatch(hostile, /["<>&]/u);
  assert.match(hostile, /^--as-idle:'a\\27 b\\22 \\3c c\\3e \\26 d\\5c e';--as-wired:'✓ a\\27 b/u);
});

/** The Chinese string literals of a browser script and whether each is the key of a translator call. */
function literalsOf(script: string) {
  const tree = ts.createSourceFile("studio-client.js", "(" + script + ")", ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found: Array<{ text: string; translated: boolean }> = [];
  const keyOf = (node: ts.Node, call: ts.CallExpression): boolean => {
    for (let at: ts.Node | undefined = node; at && at !== call; at = at.parent) if (at === call.arguments[0]) return true;
    return false;
  };
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && HAN.test(node.text)) {
      let translated = false;
      for (let at: ts.Node | undefined = node.parent; at && !translated; at = at.parent) {
        if (ts.isCallExpression(at) && ts.isIdentifier(at.expression) && at.expression.text === "L" && keyOf(node, at)) translated = true;
        if (ts.isFunctionLike(at) && !ts.isArrowFunction(at)) break;
      }
      found.push({ text: node.text, translated });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

test("every Chinese string the studio client writes goes through the translator, except the catalog's group names, which are translated where they are shown", () => {
  const raw = literalsOf(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT).filter(item => !item.translated).map(item => item.text);
  assert.deepEqual(raw, ["版面", "展示", "录入", "操作", "浮层", "反馈"], "only GROUPS is left (it is also the key the catalog's components are grouped by)");
  // The wrapper the workbench mounts; the generated plugin's own renderer (the design system's) is not the studio's text.
  const wrapper = AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT.replace(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT, "()=>{}").replace(PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT, "{}");
  assert.deepEqual(literalsOf(wrapper).filter(item => !item.translated), [], "and so does the wrapper the workbench mounts");
  assert.ok(literalsOf(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT).filter(item => item.translated).length > 150, "and the client really calls the translator for its sentences");
  assert.match(AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT, /mode:'studio',translate:host\.translate,/u, "the workbench hands its translator to the studio client");
});

// Messages the studio's routes send as they are, which the page translates where it shows them: the request-time answers a person
// reaches by asking (agent-surface.ts and its studio-*.ts parts, agent-workflow.ts, agent-store.ts). The workflow's errors raised while a build runs (a model
// answer that fails validation, a gate or an acceptance that fails) are build-record text and stay as written (BL-125).
const ROUTE_MESSAGES = [
  "请先选择构建使用的模型", "请先在右上角选择构建使用的模型", "所选模型尚未配置，请在模型设置中完成配置", "试用数据被同时修改，请重试", "还没有接通的功能可以试用", "这个插件当前没有运行，请在创作台里启用", "找不到这个插件的已安装版本",
  "界面组件不存在", "这轮界面验收已结束", "界面验收需要从创作台页面发起", "未知的组件操作", "这个方案还没有效果图", "效果图读取失败", "未声明的创作台操作", "发布前请先修好调用模型的写法：",
  "旧构建结果已作废", "草稿已更新，请重试", "此草稿已有执行中的工作", "选中的方案已失效，请重新选择", "还没有确定的方案可以修改", "草稿已改变，请刷新", "方案已失效", "功能验证通过后才能调整界面", "这个操作尚未接通，输入已保留",
  "功能接通并通过检查后才能单独调整界面", "请输入具体修改意见", "草稿已更新或正在构建，请先暂停并刷新", "没有等待启用的插件", "这个项目不能在这里启用插件", "组件选择已失效", "没有可撤销的合同修订",
  "全部功能和浏览器验收通过后才能发布", "发布版本不存在", "未知构建操作", "找不到这个创作草稿", "请填写不超过 48000 字的需求", "发布版本已存在", "请先停止构建并刷新", "已发布作品请在插件设置中卸载，保留版本记录",
];

test("the studio's route messages are still what the server throws, and each has English", async () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const sources = (await Promise.all(["apps/local-host/src/plugin-builder/agent-surface.ts", "apps/local-host/src/plugin-builder/studio-ports.ts", "apps/local-host/src/plugin-builder/studio-preview.ts", "apps/local-host/src/plugin-builder/studio-images.ts", "plugins/native/plugin-builder/src/agent-workflow.ts", "plugins/native/plugin-builder/src/agent-store.ts"]
    .map(file => readFile(join(repoRoot, file), "utf8")))).join("\n");
  for (const message of ROUTE_MESSAGES) {
    assert.ok(sources.includes("'" + message + "'"), `${message}: a route still sends it (reword the server message and this list together)`);
    assert.doesNotMatch(english(message), HAN, `${message} has English`);
  }
});

test("each sentence, label and catalog entry the studio shows has English with the same placeholders and nothing that could break markup", () => {
  const keys = new Set([
    ...literalsOf(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT).filter(item => item.translated).map(item => item.text),
    // Groups, and the components' names and descriptions, are looked up by value at the place they are drawn.
    ...["版面", "展示", "录入", "操作", "浮层", "反馈"], ...PLUGIN_COMPONENTS.flatMap(component => [component.name, component.description, component.group]),
    // The stage's own label, which the workbench puts on the pane.
    "插件创作工作台",
    ...ROUTE_MESSAGES,
  ]);
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map(match => match[1]).sort().join(",");
  for (const key of keys) {
    const text = english(key);
    assert.doesNotMatch(text, HAN, `${key} has English`);
    assert.equal(placeholders(text), placeholders(key), `${key} keeps its placeholders`);
    assert.doesNotMatch(text, /["<>&]/u, `${key}: the English lands in attributes and markup`);
  }
});

test("the studio client writes its messages through the translator it is handed, and in Chinese without one", async () => {
  // The preview frame's path, which needs no page: an unfinished draft reports why it cannot be drawn.
  const run = async (translate?: (zh: string) => string) => {
    const root = { textContent: "", dataset: {} as Record<string, string>, matches: () => true };
    const lifetime = { alive: true, own: () => () => {}, assertCurrent: () => {}, fetch: async () => ({ ok: true, json: async () => ({ build: {} }) }) };
    const host = { mode: "preview", root, build: "draft", api: (path: string) => path, translate, mountPluginClient: () => lifetime, components: () => ({ update: async () => {}, destroy: () => {} }) };
    (0, eval)(AGENT_STUDIO_CLIENT_FACTORY_SCRIPT)(host);
    await new Promise(resolve => setTimeout(resolve, 10));
    return root.textContent;
  };
  assert.equal(await run(english), "This draft has no chosen proposal yet");
  assert.equal(await run(), "这个草稿还没有确定方案", "a frame has no translator and shows the Chinese text");
});
