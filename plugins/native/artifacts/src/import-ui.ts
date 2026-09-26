import type { ArtifactBrowserUiModel } from "./browser-ui.js";

export interface ArtifactImportUiModel {
  connections?: readonly { connection_id: string; service_id: string; display_name: string; state: string }[];
  readonly routePrefix: string;
  readonly controlToken: string;
  readonly connectionStatus: Readonly<Record<string, boolean>>;
  readonly projectTitle: string;
  readonly primitives: ArtifactBrowserUiModel["primitives"];
}

const SOURCES = [
  { id: "notion", label: "Notion", placeholder: "https://www.notion.so/...", help: "请先在 Notion 中将这个页面共享给已配置的集成。" },
  { id: "feishu", label: "飞书", placeholder: "https://example.feishu.cn/docx/...", help: "支持飞书文档和知识库链接；连接器需要拥有该文档的读取权限。" },
  { id: "lark", label: "Lark", placeholder: "https://example.larksuite.com/docx/...", help: "支持 Lark 文档和知识库链接；连接器需要拥有该文档的读取权限。" },
  { id: "google-docs", label: "Google Docs", placeholder: "https://docs.google.com/document/d/.../edit", help: "连接器需要拥有这份 Google 文档的读取权限。" },
  { id: "file", label: "本地文件", placeholder: "", help: "可从其他文档工具导出 Markdown、纯文本或 HTML，再选择文件导入。" },
] as const;

export const ARTIFACT_IMPORT_STYLES = `
  html:has(> body.artifact-import-page) { height:100dvh; overflow:hidden; }
  body.artifact-import-page { height:100dvh; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; margin:0; background:var(--page); color:var(--ink); font:14px/1.6 var(--font); }
  .artifact-import-page * { box-sizing:border-box; }
  .artifact-import-page a { color:var(--blue-dark); text-underline-offset:3px; }
  .artifact-import-main { max-width:760px; margin:0 auto; padding:32px clamp(20px,5vw,48px) 64px; overflow-wrap:anywhere; }
  .artifact-import-page[data-native-desktop] .artifact-import-main { padding-top:52px; }
  .artifact-import-back { display:inline-flex; align-items:center; gap:8px; min-height:44px; text-decoration:none; }
  .artifact-import-back svg { width:16px; height:16px; transform:rotate(180deg); }
  .artifact-import-project { color:var(--muted); margin:24px 0 4px; }
  .artifact-import-main h1 { margin:0 0 12px; font-size:clamp(24px,4vw,32px); line-height:1.3; }
  .artifact-import-intro { color:var(--muted); margin:0 0 28px; }
  .artifact-import-form { padding:24px; background:var(--paper); border:1px solid var(--line); border-radius:12px; }
  .artifact-import-form fieldset { border:0; padding:0; margin:0; min-width:0; }
  .artifact-import-form label { display:grid; gap:8px; margin-bottom:20px; font-weight:600; }
  .artifact-import-form input, .artifact-import-form select { width:100%; min-height:44px; padding:10px 12px; font:inherit; font-weight:400; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:7px; }
  .artifact-import-form input[type=file] { padding:8px; }
  .artifact-import-form input::file-selector-button { min-height:28px; margin-right:10px; }
  .artifact-import-help, .artifact-import-connection { color:var(--muted); margin:0 0 20px; }
  .artifact-import-connection { padding:12px 14px; background:var(--rail); border-radius:7px; }
  .artifact-import-connection a { display:inline-block; margin:4px 0 0; }
  .artifact-import-form button, .artifact-import-result-link { display:inline-flex; justify-content:center; align-items:center; min-height:44px; padding:10px 16px; border:1px solid var(--line); border-radius:7px; font:inherit; cursor:pointer; text-decoration:none; }
  .artifact-import-form button[type=submit] { background:var(--blue-dark); color:var(--paper); border-color:transparent; }
  .artifact-import-form button[type=button] { background:var(--paper); color:var(--ink); }
  .artifact-import-form button:disabled { opacity:.55; cursor:wait; }
  .artifact-import-form [hidden] { display:none !important; }
  .artifact-import-status { margin:16px 0 0; color:var(--muted); }
  .artifact-import-error { margin:16px 0 0; padding:12px; border-left:3px solid currentColor; color:var(--ink); background:var(--rail); }
  .artifact-import-result h2 { margin:0 0 12px; font-size:20px; }
  .artifact-import-result-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:20px; }
  .artifact-import-warnings { padding:12px 16px; margin:16px 0; background:var(--rail); border-radius:7px; }
  .artifact-import-warnings h3 { margin:0 0 8px; font-size:14px; }
  .artifact-import-warnings ul { margin:0; padding-left:20px; }
  .artifact-import-page :focus-visible { outline:var(--focus-stroke); outline-offset:3px; }
  @media(max-width:600px) { .artifact-import-main { padding-top:16px; } .artifact-import-form { padding:18px; } .artifact-import-form input, .artifact-import-form select { font-size:16px; } }
`;

export function renderArtifactImportSurface(model: ArtifactImportUiModel): string {
  const p = model.primitives;
  const messages = Object.fromEntries([
    ["ready", "凭据已配置，导入时验证文档访问权限。"],
    ["missing", "尚未配置此连接器。请先配置凭据，再返回这里导入。"],
    ["busy", "正在读取文档并保存 Artifact…"],
    ["submit", "导入文档"],
    ["retry", "重试导入"],
    ["failed", "导入失败。请检查链接、文档权限和连接器配置后重试。"],
    ["network", "无法连接到本地服务。请检查服务状态后重试。"],
    ["timeout", "读取文档超时。你可以重试；同一次导入不会重复创建版本。"],
    ["fileRequired", "请先选择一个文件。"],
    ["fileType", "仅支持 .md、.markdown、.txt、.html 和 .htm 文件；不支持 PDF、DOCX 或 ZIP。"],
    ["fileSize", "文件不能超过 2 MB。"],
    ["fileEncoding", "无法读取文件。请将文件保存为 UTF-8 编码后重试。"],
    ["url", "请输入文档的 HTTPS 链接。"],
    ["success", "文档已导入"],
    ["reused", "内容未变化，已保留现有版本"],
    ["invalidResult", "服务返回的版本信息不完整。请重试以获取导入结果。"],
  ].map(([key, value]) => [key, p.text(value!)]));
  return `<main class="artifact-import-main">
    <a class="artifact-import-back" href="${p.escape(model.routePrefix + "/artifacts")}">${p.text("返回 Artifact 列表")}</a>
    <p class="artifact-import-project">${p.escape(model.projectTitle)}</p>
    <h1>${p.text("导入文档")}</h1>
    <p class="artifact-import-intro">${p.text("把外部文档保存为当前项目的 Artifact。保留本次读取的正文和来源；原文后续修改不会自动同步。")}</p>
    <form class="artifact-import-form" data-artifact-import-form data-route-prefix="${p.escape(model.routePrefix)}" data-import-messages="${p.escape(JSON.stringify(messages))}" data-import-connections="${p.escape(JSON.stringify(model.connections ?? []))}">
      <fieldset data-import-fields>
        <label>${p.text("文档来源")}<select name="source" data-import-source>${SOURCES.map(source => `<option value="${source.id}" data-connected="${Boolean(model.connectionStatus[source.id])}" data-placeholder="${p.escape(source.placeholder)}" data-help="${p.escape(p.text(source.help))}">${p.text(source.label)}</option>`).join("")}</select></label>
        <p class="artifact-import-help" data-import-help>${p.text(SOURCES[0].help)}</p>
        <div data-import-online>
          <label>${p.text("账号连接")}<select name="connection_id" data-import-account required><option value="">${p.text("选择连接")}</option></select></label>
          <div class="artifact-import-connection"><span data-import-connection-status>${p.text(model.connectionStatus.notion ? "凭据已配置，导入时验证文档访问权限。" : "尚未配置此连接器。请先配置凭据，再返回这里导入。")}</span><br><a href="/settings/connectors?connector=notion" data-import-settings>${p.text("配置连接器")}</a></div>
          <label>${p.text("文档链接")}<input name="url" type="url" placeholder="${SOURCES[0].placeholder}" required autocomplete="off" spellcheck="false"></label>
        </div>
        <div data-import-file hidden>
          <label>${p.text("选择文件")}<input name="file" type="file" accept=".md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html" disabled aria-describedby="artifact-import-file-help"></label>
          <p id="artifact-import-file-help" class="artifact-import-help">${p.text("支持 UTF-8 编码的 Markdown、纯文本和 HTML，单个文件不超过 2 MB。不支持 PDF、DOCX 或 ZIP；请先从原工具导出支持的格式。")}</p>
          <label>${p.text("标题（可选）")}<input name="title" type="text" disabled placeholder="${p.text("留空则使用文件名")}"></label>
        </div>
        <button type="submit" data-import-submit>${p.text("导入文档")}</button>
      </fieldset>
      <p class="artifact-import-status" data-import-status role="status" aria-live="polite" hidden></p>
      <p class="artifact-import-error" data-import-error role="alert" hidden></p>
      <section class="artifact-import-result" data-import-result hidden aria-labelledby="artifact-import-result-title">
        <h2 id="artifact-import-result-title" data-import-result-title tabindex="-1">${p.text("文档已导入")}</h2>
        <p data-import-version></p>
        <div class="artifact-import-warnings" data-import-warnings hidden><h3>${p.text("导入说明")}</h3><ul data-import-warning-list></ul></div>
        <div class="artifact-import-result-actions"><a class="artifact-import-result-link" data-import-result-link>${p.text("查看这个版本")}</a><button type="button" data-import-again>${p.text("继续导入")}</button></div>
      </section>
    </form>
  </main>`;
}
