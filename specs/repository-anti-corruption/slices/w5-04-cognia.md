# W5-03 / W5-04 Cognia 片：稳定翻译键与打包的、类型检查的客户端

状态：评审中（2026-10-24）。Cognia 的页面客户端与页面文字按 Todo、Issues、Jelly 片的做法改完，分支 `ac-clients-cognia` 已开 PR；本机延后验证见 PR 正文。

验收编号：RAC-144～145。

## 范围

`plugins/native/cognia/`：

- 客户端从一份模板字符串（`client.ts`，约 100 行压成的 `(host) => {…}`）改成 `src/browser/` 的 TypeScript（15 个模块：页面状态与共用的取值、请求、列表与筛选、阅读与出处、对话框、各流程的提交、上传、按钮命令表与事件），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/cognia-client.js`；`src/client.ts` 只读这份包。
- 请求：原先自己拼 `fetch` 与控制头，现在经共同的 `molisWorkRequest`（`src/browser/request.ts`）；插件路径取自 `host.pluginRoute("/library" + path)`，目录授权走 `host.route`，包里不再写插件 id。失败仍是带 `code` 的 Error。对话框用 `host.confirm` / `host.prompt`，不用浏览器弹窗。
- 页面文字：`ui.ts` 与 `src/browser/` 里的中文都改成稳定键 `cognia.<区域>.<名称>`，中英文放在 `src/messages.ts`（`COGNIA_MESSAGES`，111 个键），`registration.messages` 登记。英文取改前页面实际显示的英文（合并后的有效英文，而不是只看 `COGNIA_EN` 自己的值）；新增 3 个带参数的键（已选 {count} / 5、领域：{name}）和 1 个原先漏译的词（移出草稿列表）。
- `src/en.ts`：原先 138 条，逐个按谁在查来分：只有 Cognia 页面查的词改成稳定键后删掉；别的主人仍按中文原文查的 3 个词搬回那个主人的词典（`正在读取资料…` 进 `side-panel-en.ts`；`预览导入`、`格式` 进 Pages 的 `en.ts`），英文与合并后的一样；没人查的 11 条删掉。Cognia 服务端抛出的错误、模型提示和导入预览里文件被跳过的 4 个原因，页面把收到的中文原文交给 `translate`，这 33 条留下，登记在 BL-457（做完的条件：错误与预览回执能带稳定键并由页面消费）。
- 合并后整个目录逐词对照改前，有效英文只有三处跨页面的变化：`正在处理…` 由 Processing… 变成 Working…（助理岛），`添加材料` 由 Add material 变成 Add files（Shelf），`未分类` 由 Unclassified 变成 Unfiled（Pages）——这三句原先被 Cognia 的同名条目盖掉，现在显示各自主人的词；`移出草稿列表` 原先没有英文，现在有。
- 不动 `manifest.ts`（#1098）和 `*actions.ts`（#1117）。

## 不变的行为

- 工厂不再返回 `{ refresh }`：宿主里没有任何地方读工厂的返回值，原来的返回值没人用。
- 导入、手动添加、领域管理、材料编辑、综合、问答流程的步骤、校验和请求顺序不变；`webkitdirectory` 上传仍在发出前按 `UPLOAD_LIMITS`（1000 个文件、32 MB 一批）先检查，目录路径仍经宿主选择器取得授权，界面不接受手填绝对路径。
- 服务端回的跳过原因仍是中文原文（`wire.ts` 的 `SKIP_REASON`），页面按原文识别后交给 `translate`；这是线上值，不是页面文字。
- 页面状态（当前材料、选中的材料、草稿列表）仍只在页面里；跨对象事件沿用已登记的名字：`molis-work:model-ready`、`data-assistant-context` 的发布，没有新事件。

## 验收

- RAC-144：`ui.ts` 与 `src/browser/` 用到的每个 `cognia.*` 键都有中英文且占位符一致，登记的键没有多余；这些文件里没有直接写作键的中文字符串（`wire.ts` 的线上值除外）；服务端画出的页面没有直接写入的中文；`COGNIA_EN` 里剩的每一条都由 Cognia 的服务端抛出或是跳过原因，页面的词和死键不在其中；页面词的英文与改前一致（`tests/cognia-client-bundle.test.ts`）。
- RAC-145：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗、硬写的插件 id，构建跑浏览器类型检查，包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis-work:model-ready`、`webkitdirectory`、`/import/preview`、`/directory-grants`，请求经 `molisWorkRequest`（`tests/cognia-client-bundle.test.ts`、`tests/cognia-workbench.test.ts`）。
- 页面资源：`/assets/molis-work-plugins/cognia.js` 由 24,090 降到 22,133 字节（`tooling/gates/page-assets.json`，本片只变小）。
- 行为不变：README「改动后必跑」与页面端到端用例（`tests/cognia-actions.e2e.test.ts`、`tests/cognia-embedded-settings.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`）通过。
