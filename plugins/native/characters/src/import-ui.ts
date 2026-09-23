export const CHARACTER_IMPORT_HTML = `
  <dialog class="mw-dialog mw-dialog--form characters-dialog characters-import-dialog" data-character-import-dialog aria-labelledby="character-import-heading">
    <div class="mw-form mw-dialog__shell"><header class="mw-form__header"><h2 id="character-import-heading">把熟悉的 Agent 带进来</h2><p>保留做事方式、Skills 和附件，成为你的 Character。</p></header>
    <section class="mw-form__body">
      <details class="characters-location"><summary>指定位置或加入项目规则</summary><label>Agent<select class="mw-input" data-character-import-runtime><option value="">自动发现</option><option value="codex">Codex</option><option value="claude-code">Claude Code</option><option value="cursor">Cursor</option><option value="opencode">OpenCode</option><option value="grok-build">Grok Build</option></select></label><label>配置目录（可选）<input class="mw-input" data-character-import-config placeholder="例如 /Users/you/.claude"></label><label>项目目录（可选）<input class="mw-input" data-character-import-project placeholder="仅在该项目下使用这些规则"></label></details>
      <button class="mw-btn mw-btn--secondary" type="button" data-character-scan>重新扫描</button>
      <div class="characters-sources" data-character-sources aria-label="发现的本地 Agent"></div>
      <div data-character-import-preview></div><p class="characters-hint" role="status" data-character-import-notice></p>
    </section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-character-import-close>取消</button><button class="mw-btn mw-btn--primary" type="button" data-character-import-confirm disabled>导入 Character</button></footer></div>
  </dialog>
  <dialog class="mw-dialog mw-dialog--form characters-dialog" data-character-run-dialog aria-labelledby="character-run-heading">
    <div class="mw-form mw-dialog__shell"><header class="mw-form__header"><h2 id="character-run-heading">使用 Character</h2><p data-character-run-version></p></header><section class="mw-form__body">
      <label>工作目录<select class="mw-input" data-character-run-workspace></select></label>
      <label>这次想做什么<textarea class="mw-input" data-character-run-task rows="4" maxlength="20000" placeholder="描述一个具体任务"></textarea></label>
      <div class="characters-run-modes"><section><h3>Molis 内置引擎</h3><p>固定规则和文本 Skills，沿用 Coding 的工具审查与执行记录。</p><p data-character-internal-status></p><details><summary>选择本轮 Skills</summary><div data-character-run-skills></div></details><button class="mw-btn mw-btn--primary" type="button" data-character-run-internal>到 Coding 继续</button></section>
      <section><h3 data-character-native-name>本地 Agent</h3><p data-character-native-notice></p><button class="mw-btn mw-btn--secondary" type="button" data-character-run-native>启动原生 Agent</button></section></div>
      <p role="status" class="characters-hint" data-character-run-notice></p></section><footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-character-run-close>关闭</button></footer></div>
  </dialog>`;

export const CHARACTER_SOURCE_HTML = `<section class="characters-source-detail" data-character-source-detail hidden><div class="characters-actions"><h2>导入内容</h2><button class="mw-btn mw-btn--ghost" type="button" data-character-rescan>检查来源更新</button></div><p data-character-source-summary></p><div data-character-source-files></div></section>
  <section class="characters-use"><h2>用这个 Character 做事</h2><p class="characters-hint">使用时发布一个固定版本。已有任务保持原版本。</p><button class="mw-btn mw-btn--secondary" type="button" data-character-use>发布并使用</button></section>
  <section data-character-native-section hidden><h2>原生执行记录</h2><div data-character-native-runs></div><div class="characters-terminal-toolbar"><span data-character-terminal-status></span><button class="mw-btn mw-btn--ghost" type="button" data-character-terminal-stop>停止进程</button></div><div class="characters-terminal" data-character-terminal></div><details><summary>已保存输出</summary><pre data-character-run-output></pre></details></section>`;
