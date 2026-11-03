# W5-03/04 灵光片：稳定翻译键与打包、类型检查的客户端

状态：执行中（2026-10-23）。灵光的页面文字全部改成稳定键，页面客户端改成打包、类型检查的 TypeScript；本地构建和定向验证通过，待评审与统筹集成全量。叠在 R11（#1169，`ac-r11-intake`）上，因为两者都改 `src/client.ts` 与 `src/ui.ts`；#1169 合入后合 main 再改 base。

验收编号：RAC-146～147。

## 范围

`plugins/native/lingguang/`：

- 页面文字：`ui.ts` 里 54 处 `p.text("中文")` 和客户端里的 66 处 `L("中文")`，改成 89 个稳定键 `lingguang.<区域>.<名称>`（`src/messages.ts`，中英文并排，登记在 `registration.ts` 的 `messages`）。拼出来的句子（读取来源、转写模型提问、交给助理的材料标题与最近几句）改成带占位符的整句，不再在代码里拼英文。
- 客户端：从一份 700 行的模板字符串改成 `src/browser/` 的 TypeScript（`types`、`dom`、`request`、`page`、`editor`、`list`、`load`、`material`、`chat`、`commands`、`factory`），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/lingguang-client.js`；`src/client.ts` 只读这份包。页面状态在一个 `LingguangPage` 里，各部件（编辑与空白灵光的丢弃、列表、读取文件与链接、头脑风暴与交给助理、按钮命令表）各自一个模块。
- 请求：原先自己拼 `fetch(host.route(path), {headers: molisWorkControlHeaders()})`，现在经共同的 `molisWorkRequest`（带 `scope`，离开页面即取消），失败仍是带 `code` 和 `status` 的 Error；读取被拒时的说明走 `host.readRefusal`。读文件、读链接和头脑风暴的流式请求也带 `scope`。
- 插件身份：助理上下文里的 `plugin_id` 来自 `host.pluginId`，请求路径来自 `host.pluginRoute`；浏览器代码里不再写 `io.molis.work.lingguang` 和 `/api/plugins/…`。
- `src/en.ts` 只留 7 条宿主仍按中文原文翻译的词（BL-459）；esbuild 是包的直接开发依赖，版本与根相同（`pnpm-lock.yaml` 同步）。
- 行为保持：空白灵光的丢弃（返回、换一条、工作台收起或隐藏、页面走掉）、带 `expected_updated_at` 的保存队列、列表与去向标签、读文件与链接、头脑风暴与交给助理、复制、`panePlugin` 与 `molis-work:select-item` 的入口、R11 的「转为待办」按钮数据，逻辑逐段照搬。原有的单元用例（`tests/lingguang-blank-discard.test.ts`）一条没改，换成同一份打包后的脚本跑。

不动 `manifest.ts`、`actions.ts`、`plugin.ts`、`store.ts`。不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

灵光自己的页面，81 个键的英文与原来显示的完全一样；其余的变化如下，别的主人的页面一条没变：

- `清空`（选区条上的按钮）：原来显示 `Cleared`（别的主人对同一句中文的译法压过了灵光自己写的），现在是灵光自己写的 `Clear selection`。
- 转写需要下载模型的提问：原来是三段拼起来，带中文全角括号 `（N MB）`；现在是整句 `… speech model (N MB), used only on this machine. …`。
- 读取结果的说明、文件与来源：原来英文里夹着中文全角冒号和分号（`Note: a；b`），现在是 `Note: a; b`；`File: x`、`Source: x` 不变。
- 交给助理的材料标题与最近几句：`灵光「x」` 的英文由 `Lingguang「x」` 改为 `Lingguang "x"`；`Lingguang：…` 与 `Me：…` 改为 `Lingguang: …`、`Me: …`；`last 1 lines` 改为 `last 1 line`。
- 别的主人仍在查的两个词不动：`交给助理`（情境浮条与 Artifacts）继续显示灵光的 `Hand to the Assistant`，`我`（Pages 的评论侧栏）继续显示 `Me`，留在 `src/en.ts`（BL-459）。

`src/en.ts` 原有 97 条：90 条只有灵光页面查（页面改成稳定键后没人查），删除；其余 7 条保留。逐条核对过合并后的英文词典（工作台 `i18n/en.ts`）：删除后，除上面这一组灵光页面自己的词，没有任何别的键的英文变化或消失。

## 验收

- RAC-146：`ui.ts` 与 `src/browser/` 用到的每个 `lingguang.*` 键都有中英文且占位符一致，登记的键没有多余；用仓库真实翻译扫描器 scanTree 核对 120 处调用（页面 54、浏览器 66），没有未解析的动态键，没有中文键；`ui.ts` 画出的页面没有直接写入的中文（`tests/lingguang-client-bundle.test.ts`）。
- RAC-147：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:placement-result`、`molis:placement-convert`、`molis-work:select-item`、`panePlugin`、`lingguang.revert`；请求经 `molisWorkRequest`（`tests/lingguang-client-bundle.test.ts`）。空白灵光的丢弃、保存队列与「转为待办」按钮数据在 `tests/lingguang-blank-discard.test.ts` 里用共同请求器和假 DOM 跑真实的包（21 条，其中「转为待办按钮随屏幕上的灵光更新」是新增的）；列表保滚动、丢掉与返回后重读在 `tests/list-silent-refresh.test.ts` 里读源码核对。
- 页面资源：`/assets/molis-work-plugins/lingguang.js` 由 26,094 降到 23,300 字节（`tooling/gates/page-assets.json` 同步）。#1169 为 R11 加的一次性放行（+24）是叠在它上面的，本片比它低 2,818 字节，合入后该条按规则删掉用完的。
- 行为不变：README「改动后必跑」、灵光的浏览器用例（`tests/lingguang-plugin.e2e.test.ts`、`tests/lingguang-one-place.e2e.test.ts`、`tests/todo-from-inbox.e2e.test.ts`）通过。

## 登记的遗留

- BL-458：每次插件页面 frame 挂载多一次 `/api/contextual/surfaces`（`plugin-frame/parent.ts` 串行读取，`context-actions.ts` 的 `known()` 另缓存一份）。工作台壳的共享核心，现在不改，写明了位置、不改的原因和做完的样子。
- BL-459：灵光的 `src/en.ts` 保留的 7 条（服务端标签与错误、两个别的主人在查的词）。
