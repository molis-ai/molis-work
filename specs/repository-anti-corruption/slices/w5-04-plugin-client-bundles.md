# W5-03 / W5-04 逐插件：稳定翻译键与打包的客户端

状态：执行中（2026-10-23）。Todo 片（RAC-130～134）本地验证通过，待 CI；Issues、Jelly、Images、Cognia、灵光各自一个 PR，编号段见下。

验收编号：RAC-130～149。

## 目标

两件事一起做，一个插件一个 PR：

- W5-03（PG-071）：插件页面上的字改成稳定键 `<插件>.<区域>.<名称>`，中英文都放在插件自己的 `src/messages.ts`，登记在 `registration.ts` 的 `messages`；页面代码不再用中文原文当键。工作台的 `i18n/en.ts` 不再为该插件的页面文字 import 词典。
- W5-04（PG-056、PG-070）：插件的浏览器代码改成 `src/browser/*.ts` 的 TypeScript，`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/<插件>-client.js`；请求只经共同的 `molisWorkRequest`，不直接 `fetch`。样板是 Form（W4-04）；翻译样板是 Images（#751）。

## 做法（给后面的片）

1. 把 `client.ts` 里的模板字符串按部件拆成 `src/browser/` 的模块：`types.ts`（页面、状态、元素的类型）、`dom.ts`（取元素与小工具）、`request.ts`（`declare const molisWorkRequest: UiRequest`，错误用稳定键）、`page.ts`（`XxxPage`：元素、状态、共用操作）、各部件（列表、详情、……，各自把操作装到 `XxxPage` 上）、`commands.ts`（按钮命令表）、`events.ts`（页面事件）、`factory.ts`（入口，导出 `(host) => …` 要的函数）。不用 `any`、`as unknown as`、空 `catch`。
2. `package.json`：`typecheck`/`build` 里加 `tsc -p tsconfig.browser.json`，再 `esbuild src/browser/factory.ts --bundle --minify --format=iife --banner:js='(host) => {' --footer:js='}' --outfile=dist/<插件>-client.js`；`tsconfig.json` 排除 `src/browser/**`。
3. `src/client.ts` 只剩 `readFileSync(new URL("./<插件>-client.js", import.meta.url), "utf8").trim()`。
4. 翻译：给页面用到的每句话起稳定键写进 `messages.ts`（英文逐字照搬原词典），`ui.ts` 与浏览器代码改用键；`registration.ts` 加 `messages`，`index.ts` 导出。原 `en.ts` 只留别的主人仍按中文原文翻译的词（动作输入的标题、首页事项、搜索词、通用词）。
5. 门禁：`node scripts/gates/translations.mjs`（翻译缺口、稳定键问题）；新文件先 `git add -N`，门禁只看已跟踪文件。`node scripts/gates/page-assets.mjs --base origin/main`，变小就 `--update`。

## Todo 片（本 PR）

范围：`plugins/native/todo/`（页面客户端 1,231 行模板字符串 → `src/browser/` 14 个模块；`ui.ts` 80 处改键；`messages.ts` 249 个键）、`tests/todo-plugin.test.ts`、`apps/workbench/src/i18n/renderer-gap-en.ts`（工作台自己的 `context-onboarding.ts` 用到的两句：此前借 Todo 词典出英文，Todo 词典缩小后补在工作台自己的缺口表里）。不动 `manifest.ts`（#1098）。

## 验收

- RAC-130：Todo 页面（`ui.ts`、`src/browser/`）用到的每个 `todo.*` 键在 `TODO_MESSAGES` 里都有中文和英文，两种语言的占位符一致；翻译器调用的参数里没有中文原文。
- RAC-131：Todo 的浏览器代码是 `src/browser/` 的 TypeScript，类型检查通过，构建出 `dist/todo-client.js`，`TODO_CLIENT_FACTORY_SCRIPT` 能当函数解析，内含快速输入的解析、`data-assistant-context`、`molis:assistant-effect`、输入法确认不提交，没有 `confirm`/`alert`/`prompt`。
- RAC-132：浏览器代码不直接 `fetch`，请求经 `molisWorkRequest`；不含 `any`、`as unknown as`、空 `catch`；构建跑浏览器类型检查。
- RAC-133：`/assets/molis-work-plugins/todo.js` 的字节数与实测一致（`tooling/gates/page-assets.json`），变化写进 PR。
- RAC-134：行为不变：Todo 的单元、整理、HTTP、页面与端到端用例（README「改动后必跑」）在 CI 全量中通过；英文界面的每句话与迁移前相同（249 条英文逐条照搬原 `TODO_EN`）。

## 后续片编号（预留）

| 片 | 验收编号 | 备注 |
| --- | --- | --- |
| Todo R11（Inbox/灵光转待办走通用交接，工作台不再认识 Todo 的输入） | RAC-135～137 | 在灵光片之前 |
| Issues | RAC-138～139 | |
| Jelly | RAC-140～141 | |
| Images | RAC-142～143 | 翻译半边 #751 已做，只补 W5-04 的打包 |
| Cognia | RAC-144～145 | 不动 `*actions.ts`（#1117） |
| 灵光 | RAC-146～147 | 不动 `*actions.ts`（#1117）；其客户端碰 `data-make-todo`，排在 R11 之后 |

积压编号：BL-455～459（Todo 余下的 `TODO_EN` 等 VUX ⑥ 动作标题翻译后再删；别的主人依赖的 14 个通用词）。
