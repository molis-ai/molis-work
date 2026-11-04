# W5-03/04 PPT 片：稳定翻译键与打包、类型检查的客户端

状态：执行中（2026-10-24）。PPT 的页面文字全部改成稳定键，页面客户端改成打包、类型检查的 TypeScript；本地构建和定向验证通过，待评审与统筹集成全量。从 main 起，不叠在别的片上（做法与 Dataset 片 `w5-03-dataset.md` 相同，各改各的包，只在共享的测试文件里有相邻行的文本冲突，见「合并提示」）。

验收编号：RAC-152～153。

## 范围

`plugins/native/ppt/`：

- 页面文字：`ui.ts` 里 54 处 `p.text("中文")` 和客户端里的 54 处 `L("中文")`，改成 82 个稳定键 `ppt.<区域>.<名称>`（`src/messages.ts`，中英文并排，登记在 `registration.ts` 的 `messages`）。带数量的句子（「N 页」、导出菜单里的「PowerPoint · N 页，含讲者备注」、「已生成 N 页」）改成带 `{count|one|other}` 的整句，不再在代码里拼英文。
- 客户端：从一份 789 行的模板字符串改成 `src/browser/` 的 TypeScript（`types`、`dom`、`request`、`page`、`status`、`slides`、`list`、`editor`、`present`、`outline`、`record-commands`、`slide-commands`、`commands`、`events`、`factory`），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/ppt-client.js`；`src/client.ts` 只读这份包。页面状态在一个 `PptState` 里，各部件（状态、幻灯片编辑、列表、编辑与保存、演示与打印、大纲弹窗、按钮命令表、外部事件）各自一个模块。原先的点击处理拆成一张命令表（`commands.ts`），按原来的先后顺序找第一个点中的控件，需要打开着一份演示稿的命令在没有时跳过。
- 请求：原先自己拼 `fetch(withProject(host.route(path)), {headers: molisWorkControlHeaders()})`，现在经共同的 `molisWorkRequest`，失败仍是带 `code` 的 Error，冲突仍说「演示稿已在别处修改…」。路径来自 `host.pluginRoute("/ppt…")`、项目来自 `host.projectId()`；助理上下文里的 `plugin_id` 来自 `host.pluginId`；浏览器代码里不再写 `io.molis.work.ppt` 和 `/api/plugins/…`。大纲弹窗的取消仍是把 `AbortSignal` 交给同一个请求。
- `src/en.ts` 只留 18 条宿主仍按中文原文翻译的词（BL-461）；esbuild 是包的直接开发依赖，版本与根相同（`pnpm-lock.yaml` 同步）。
- 行为保持：保存队列与未保存状态、冲突保留本地输入并阻止切换和发布、幻灯片的增删与移动、主题色、讲者备注、大纲弹窗（本地整理、AI 整理、从 Pages 文档取原文，一次请求只采用它开始时的演示稿、编辑版本与输入，关闭即中止）、演示与打印、导出 JSON 与 PowerPoint、固定版本与恢复、AI 可用性的提示、`molis:placement-changed` 与 `molis-work:model-ready` 的重读、离开前的未保存提示，逻辑逐段照搬。页面不新增生命周期，请求也不带 `scope`，与 Form、Dataset 的做法一致。

不动 `manifest.ts`、`actions.ts`、`plugin.ts`、`store.ts`、`styles.ts`。不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

PPT 自己的页面，82 个键的英文与原来显示的完全一样（取合并后的英文词典对该中文原文的答案；PPT 的词被别的主人的同名词压过的，也按压过之后的显示算）。仅有的变化：

- 数量为 1 时的整句：原来「{n} 页」英文是拼出来的 `1 slides`，现在 `1 slide`（导出菜单「PowerPoint · 1 slide, with speaker notes」、大纲「1 slide generated」同理）。其余数量不变。

别的主人的页面一条没变。`src/en.ts` 原有 96 条：78 条没有别的主人在查，页面改成稳定键后删除；留下的 18 条是 PPT 的服务端标签与错误、页面转交服务端句子所依赖的词，以及别的主人在查或提到的词（见 BL-461）。逐条核对过合并后的英文词典（工作台 `i18n/en.ts`）：删除后，除上面这一条，没有任何别的键的英文变化或消失，有调用或提到的都留在 `src/en.ts`。

## 验收

- RAC-152：`ui.ts` 与 `src/browser/` 用到的每个 `ppt.*` 键都有中英文且占位符一致，登记的键没有多余；用仓库真实翻译扫描器 scanTree 核对调用，没有中文键；动态翻译只剩 `src/browser/outline.ts` 的两处（服务端写的「模型不可用」「读不到 Pages 文档」句子交给共同翻译器，BL-461）；`ui.ts` 画出的页面没有直接写入的中文（`tests/ppt-client-bundle.test.ts`）。
- RAC-153：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:placement-result`、`molis:placement-changed`、`molis-work:model-ready`、`ppt.save.saved`、`ppt.conflict`；请求经 `molisWorkRequest`（`tests/ppt-client-bundle.test.ts`）。原先靠正则读脚本文字的几处断言（`tests/creative-tools-plugins.test.ts`、`tests/list-silent-refresh.test.ts`、`tests/creative-artifact-promote.test.ts`、`tests/personal-plugins-review-fixes.test.ts`）改成读 `src/browser/` 的源码，页面行为由浏览器用例（`tests/ppt-actions.e2e.test.ts`、`tests/content-editing-regressions.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`）在真实页面上走。
- 整页门禁：PPT 的「打印框」（`host.printDocument` 的整页文档）原来写在 `src/client.ts` 的模板字符串里，现在是 `src/browser/present.ts`；`tests/shell-page-gate.test.ts` 的例外清单同步换了文件名（还是同一个例外：打印：PPT 打印框）。
- 页面资源：`/assets/molis-work-plugins/ppt.js` 由 30,580 降到 27,065 字节（`tooling/gates/page-assets.json` 同步）。
- 行为不变：README「改动后必跑」的单元用例。页面请求现在经 `molisWorkRequest`，旧测试拦 `window.fetch` 的两处（保存顺序：`tests/ppt-actions.e2e.test.ts`；大纲 AI 调用结束：`tests/content-editing-regressions.e2e.test.ts`）改成拦 `window.molisWorkRequest`（与 Dataset、Form 同一写法），断言一条没动。浏览器用例本片没有在本机跑，见 PR 的「待测」。

## 合并提示

`tests/creative-tools-plugins.test.ts`、`tests/list-silent-refresh.test.ts`、`tests/personal-plugins-review-fixes.test.ts`、`tests/creative-artifact-promote.test.ts` 同时是别的插件片要改的文件，改的是各自插件的相邻几行：谁后合入谁解一下文本冲突，不涉及断言的取舍。

## 登记的遗留

- BL-461：PPT 的 `src/en.ts` 保留的 18 条（服务端标签与错误、页面转交服务端句子所依赖的词、别的主人在查或提到的词）。
