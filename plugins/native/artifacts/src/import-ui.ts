import type { ArtifactBrowserUiModel } from "./browser-ui.js";

/** What the 成果库's import dialog needs: the connected document services (specs/artifact-positioning A3). */
export interface ArtifactImportUiModel {
  connections?: readonly { connection_id: string; service_id: string; display_name: string; state: string }[];
  readonly routePrefix: string;
  readonly connectionStatus: Readonly<Record<string, boolean>>;
  readonly primitives: ArtifactBrowserUiModel["primitives"];
}

const SOURCES = [
  { id: "notion", label: "Notion", placeholder: "https://www.notion.so/...", help: "请先在 Notion 中将这个页面共享给已配置的集成。" },
  { id: "feishu", label: "飞书", placeholder: "https://example.feishu.cn/docx/...", help: "支持飞书文档和知识库链接；连接器需要拥有该文档的读取权限。" },
  { id: "lark", label: "Lark", placeholder: "https://example.larksuite.com/docx/...", help: "支持 Lark 文档和知识库链接；连接器需要拥有该文档的读取权限。" },
  { id: "google-docs", label: "Google Docs", placeholder: "https://docs.google.com/document/d/.../edit", help: "连接器需要拥有这份 Google 文档的读取权限。" },
  { id: "file", label: "本地文件", placeholder: "", help: "任何文件都可以导入：Markdown、纯文本和 HTML 读出正文，其他文件保存原件。" },
] as const;

export const ARTIFACT_IMPORT_STYLES = `
  /* Outranks the design system's dialog.mw-dialog (no padding) and form dialogs (overflow hidden): this one scrolls its own content. */
  dialog.mw-dialog.artifact-import-dialog { width:min(560px, calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; overflow-wrap:anywhere; padding:24px; }
  @media (max-width:520px) { dialog.mw-dialog.artifact-import-dialog { padding:16px; } }
  .artifact-import-dialog header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
  .artifact-import-dialog h2 { margin:0; font-size:15px; font-weight:var(--weight-title, 600); line-height:1.4; }
  .artifact-import-intro { color:var(--muted); margin:0 0 20px; }
  .artifact-import-form fieldset { border:0; padding:0; margin:0; min-width:0; }
  .artifact-import-form label { display:grid; gap:8px; margin-bottom:20px; font-weight:600; }
  .artifact-import-form input, .artifact-import-form select { width:100%; min-height:44px; padding:10px 12px; font:inherit; font-weight:400; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:7px; box-sizing:border-box; }
  .artifact-import-form input[type=file] { padding:8px; }
  .artifact-import-form input::file-selector-button { min-height:28px; margin-right:12px; }
  .artifact-import-help, .artifact-import-connection { color:var(--muted); margin:0 0 20px; }
  .artifact-import-connection { padding:12px 16px; background:var(--rail); border-radius:7px; }
  .artifact-import-connection a { display:inline-block; margin:4px 0 0; }
  .artifact-import-form [hidden] { display:none !important; }
  .artifact-import-status { margin:16px 0 0; color:var(--muted); }
  .artifact-import-error { margin:16px 0 0; padding:12px; border-left:3px solid currentColor; color:var(--ink); background:var(--rail); }
  .artifact-import-result h3 { margin:0 0 12px; font-size:15px; }
  .artifact-import-result-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:20px; }
  .artifact-import-warnings { padding:12px 16px; margin:16px 0; background:var(--rail); border-radius:7px; }
  .artifact-import-warnings h4 { margin:0 0 8px; font-size:13px; }
  .artifact-import-warnings ul { margin:0; padding-left:24px; }
  @media(max-width:600px) { .artifact-import-form input, .artifact-import-form select { font-size:16px; } }
`;

/** The 成果库's one import entry, opened as a dialog in the workbench (specs/artifact-positioning A3). */
export function renderArtifactImportDialog(model: ArtifactImportUiModel): string {
  const p = model.primitives;
  const messages = Object.fromEntries([
    ["ready", "凭据已配置，导入时验证文档访问权限。"],
    ["missing", "尚未配置此连接器。请先配置凭据，再返回这里导入。"],
    ["busy", "正在读取并保存成果…"],
    ["submit", "导入"],
    ["retry", "重试导入"],
    ["failed", "导入失败。请检查文件、链接、文档权限和连接器配置后重试。"],
    ["network", "无法连接到本地服务。请检查服务状态后重试。"],
    ["timeout", "读取超时。你可以重试；同一次导入不会重复创建版本。"],
    ["fileRequired", "请先选择一个文件。"],
    ["fileSize", "文件不能超过 6 MB。"],
    ["fileEncoding", "无法读取文件。请将文本文件保存为 UTF-8 编码后重试。"],
    ["url", "请输入文档的 HTTPS 链接。"],
    ["success", "已导入"],
    ["reused", "内容未变化，已保留现有版本"],
    ["invalidResult", "服务返回的版本信息不完整。请重试以获取导入结果。"],
  ].map(([key, value]) => [key, p.text(value!)]));
  return `<dialog class="mw-dialog mw-dialog--form artifact-import-dialog" data-artifact-import-dialog aria-labelledby="artifact-import-title">
    <form class="artifact-import-form" data-artifact-import-form data-route-prefix="${p.escape(model.routePrefix)}" data-import-messages="${p.escape(JSON.stringify(messages))}" data-import-connections="${p.escape(JSON.stringify(model.connections ?? []))}">
      <header><h2 id="artifact-import-title">${p.text("导入到成果")}</h2><button class="mw-btn mw-btn--ghost" type="button" data-artifact-import-close aria-label="${p.text("关闭")}">${p.text("关闭")}</button></header>
      <p class="artifact-import-intro">${p.text("导入的文件或文档会作为这个项目的一个成果保留下来；原文后续修改不会自动同步。")}</p>
      <fieldset data-import-fields>
        <label>${p.text("来源")}<select name="source" data-import-source>${SOURCES.map(source => `<option value="${source.id}" data-connected="${Boolean(model.connectionStatus[source.id])}" data-placeholder="${p.escape(source.placeholder)}" data-help="${p.text(source.help)}"${source.id === "file" ? " selected" : ""}>${p.text(source.label)}</option>`).join("")}</select></label>
        <p class="artifact-import-help" data-import-help>${p.text(SOURCES.find(source => source.id === "file")!.help)}</p>
        <div data-import-online hidden>
          <label>${p.text("账号连接")}<select name="connection_id" data-import-account disabled><option value="">${p.text("选择连接")}</option></select></label>
          <div class="artifact-import-connection"><span data-import-connection-status></span> <a data-import-settings href="#">${p.text("管理连接")}</a></div>
          <label>${p.text("文档链接")}<input name="url" type="url" disabled autocomplete="off" spellcheck="false"></label>
        </div>
        <div data-import-file>
          <label>${p.text("选择文件")}<input name="file" type="file" required aria-describedby="artifact-import-file-help"></label>
          <p id="artifact-import-file-help" class="artifact-import-help">${p.text("单个文件不超过 6 MB。")}</p>
          <label>${p.text("标题（可选）")}<input name="title" type="text" placeholder="${p.text("留空则使用文件名")}"></label>
        </div>
        <button class="mw-btn mw-btn--primary" type="submit" data-import-submit>${p.text("导入")}</button>
      </fieldset>
      <p class="artifact-import-status" data-import-status role="status" aria-live="polite" hidden></p>
      <p class="artifact-import-error" data-import-error role="alert" hidden></p>
      <section class="artifact-import-result" data-import-result hidden aria-labelledby="artifact-import-result-title">
        <h3 id="artifact-import-result-title" data-import-result-title tabindex="-1">${p.text("已导入")}</h3>
        <p data-import-version></p>
        <div class="artifact-import-warnings" data-import-warnings hidden><h4>${p.text("导入说明")}</h4><ul data-import-warning-list></ul></div>
        <div class="artifact-import-result-actions"><a class="mw-btn mw-btn--primary" data-import-result-link>${p.text("查看这个版本")}</a><button class="mw-btn" type="button" data-import-again>${p.text("继续导入")}</button></div>
      </section>
    </form>
  </dialog>`;
}
