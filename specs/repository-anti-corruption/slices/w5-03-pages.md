# W5-03 Pages 片：页面客户端改成类型检查的 TypeScript，页面文字改成稳定键

状态：执行中（2026-10-24）。Pages 的页面客户端原来是九个模板字符串文件（`client-setup.ts`、`client-menus.ts`、`client-list.ts`、`client-document.ts`、`client-actions.ts`、`blank-client.ts`、`import-client.ts`、`landing-client.ts`、`list-client.ts`，合起来约 1,430 行脚本，没有类型检查），改成 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 打成 `dist/pages-client.js`；页面文字同时全部改成稳定键，页面里的中文原文查词清零（编辑器内核自己的标签除外，见 BL-464）。本地构建和定向验证通过（含 Pages 的主要浏览器用例），待评审与统筹集成全量；编辑器内核自己的浏览器用例交 Codex 测试专职（见 PR 说明）。叠在 Workflows 片（`w5-03-workflows.md`）的分支上做，只在共享的 `pnpm-lock.yaml`、`specs/BACKLOG.md`、`tooling/gates/page-assets.json` 上有相邻行的重叠，见「合并提示」。

验收编号：RAC-158～159。

## 范围

`plugins/native/pages/`：

- 客户端：九个模板字符串文件删除，换成 `src/browser/` 的 17 个文件（约 1,800 行）。页面状态在一个 `PagesPage` 对象里（`page.ts`），各部分是拿它当第一个参数的函数：`list.ts`（列表、文件夹、折叠）、`document.ts`（读写、保存队列、收藏、移动、发布、导出与打印）、`editor.ts`（挂载与填充编辑器、保存队列）、`blank.ts`（新建后留空的收回，原有的长说明随函数保留）、`landing.ts`、`import.ts`（导入对话框）、`menus.ts`、`context.ts`（对助理与选区条说明手上有什么）、`click.ts` 与 `events.ts`（事件）、`notes.ts`、`dom.ts`、`request.ts`、`types.ts`、`client.ts`、`factory.ts`。`src/client.ts` 只剩读打好的包的 `PAGES_CLIENT_FACTORY_SCRIPT`；`registration.ts` 去掉 `clientServed`（包已经压缩），`tests/plugin-client-served.test.ts` 不再含 Pages。`package.json` 的 `build` 在两个原有的 `tsc` 之后加浏览器配置的类型检查和一步 esbuild，`typecheck` 同；esbuild 作为本包的开发依赖，与根同版本（`pnpm-lock.yaml` 同步）。
- 请求：只经工作台的 `molisWorkRequest`（`request.ts`，路径在 `/pages` 之后，路由由 `host.pluginRoute` 按 Manifest 身份给出）；页面客户端不再有 `fetch(`、不写插件 id 和 `/api/plugins/` 前缀。助理上下文里的 `plugin_id` 取 `host.pluginId`；项目由宿主绑定，请求不再带 `project_id`（服务端本来只在它等于实例的项目时才接受）。导入对话框在打开时记下它的路由与项目，之后项目切换了就拒绝继续。评论侧栏的头改成 `molisWorkRequest.headers()`，不再依赖全局 `molisWorkControlHeaders`。
- 编辑器内核：`src/editor-browser.ts` 不再导出 `listFailed`（它原来住在 `list-client.ts`，被带进了 700 KB 的编辑器脚本；现在是页面客户端 `list.ts` 的函数），编辑器脚本因此小了 777 字节。
- 页面文字：`ui.ts`、评论侧栏（`comment-side-view.ts`、`comment-side-client.ts`、`comment-editor-client.ts`）、落地页（`landing-editor.ts`）与客户端里的整句中文，改成 159 个稳定键 `pages.<区域>.<名称>`（`src/messages.ts`，中英文并排，登记在 `registration.ts` 的 `messages`，从 `index.ts` 导出 `PAGES_MESSAGES`）。十个模板卡片的标题与摘要也是键（`pages.template.<模板 id>.title|summary`，`ui.ts` 的 `templateWords()` 逐个写出，没有自己词的新模板显示它自己的标题与摘要）。
- `src/en.ts` 从 304 条减到 202 条（BL-464）：删掉的 102 条都是页面自己的词（现在是键）；保留编辑器内核的标签（仍按中文原文查）、服务端标签与错误、模板的标题与摘要（模板文档本身用）、别的主人在查或提到的词。
- `tests/pages-client-bundle.test.ts`：两条验收（同 Dataset、PPT、Form、Workflows）；`tests/fixtures/pages-host.ts`：给 Pages 客户端的测试宿主（真实的 `molisWorkRequest` 加中文翻译器）。

不动：`manifest.ts`、`actions.ts`、`plugin.ts`、`store.ts`、`comments-store.ts`、`styles.ts`、`import-styles.ts` 的内容（只从原 `import-client.ts` 里搬出来）、编辑器内核的节点视图与命令、服务端页面的结构（`ui.ts` 只换翻译调用的参数）；也不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

159 个键里，157 个的英文与原来显示的完全一样（取合并后的英文词典对该中文原文的答案）。有变化的两条：

- 导入完成的计数（`pages.import.imported-count`）：原来是 `已导入` + 数字 + `篇文档` 三段拼的，英文是 `Imported 3 documents`，一篇时是 `Imported 1 documents`；现在是一条带复数的整句 `Imported {count} {count|document|documents}`，一篇时是 `Imported 1 document`。
- 竞品分析模板卡片的摘要（`pages.template.competitor.summary`）：原来的中文原文 `档案、对比、SWOT` 在英文词典里没有，英文界面显示的是中文；现在是 `Profiles, comparison, SWOT`。

删除 `src/en.ts` 里 102 条之后，用合并后的英文词典（工作台 `i18n/en.ts`）逐键比对删除前后：只有这些页面词的中文原文不再有英文条目（它们现在由键承担，上面逐条核对过），保留的 202 条没有任何改变。

## 行为不变，与细节上的几处不同

页面的行为不变：列表与文件夹、拖动归入、收藏、移动、发布、导出与打印、新建后留空的收回、保存队列与冲突处理、导入对话框、评论面板（页面里的与侧栏里的）、对助理与选区条说明的上下文（`data-assistant-context`、`molis:surface-focus`、`molis:context-tools`、`molis:context-panel-open`）、工作台的 `molis-work:select-item` 与放置事件。细节上有这几处：

- 请求失败的说法：走共享的 `molisWorkRequest` 之后，网络层的失败（拿不到答复、写请求不知道成没成）用共享助手的说法，不再是浏览器的原话；读被宿主拒绝时仍用 `host.readRefusal` 的说法。写请求带共享助手的一次性键。
- 编辑器脚本总是导出 `canShow` 与 `focusStart`，客户端不再先问「有没有这个函数」（测试里的假编辑器补了 `canShow`）。
- 助理上下文里的 `plugin_id` 取宿主给的插件 id，不再写死。

## 验收

- RAC-158：`ui.ts`、评论侧栏、落地页与 `src/browser/` 用到的每个 `pages.*` 键都有中英文且占位符一致，登记的键没有多余（以字面量写在代码里的原因键除外）；用仓库真实翻译扫描器 scanTree 核对调用，没有中文键，没有未解析的动态键，浏览器代码里没有把「不是从表里选的」词交给翻译器的地方（宿主写的词按原样显示）；每个模板都有标题与摘要的键；`ui.ts` 画出的页面没有直接写入的中文（`tests/pages-client-bundle.test.ts`）。
- RAC-159：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:surface-focus`、`molis:context-tools`、`molis-work:select-item`、`data-pages-back`、`pages.error.no-project`；请求经 `molisWorkRequest`，包里没有 `molisWorkControlHeaders`（`tests/pages-client-bundle.test.ts`）。原先对旧脚本字符串做的断言按含义改指 `src/browser/` 的源码或页面的行为：`tests/pages-plugin.test.ts`（标题回车、菜单与 Esc、保存不重挂内核）、`tests/list-silent-refresh.test.ts`、`tests/personal-plugins-review-fixes.test.ts`（Manifest 路由）、`tests/creative-artifact-promote.test.ts`（页面用中文翻译器画出）；`tests/pages-blank-discard.test.ts`、`tests/pages-draft-race.test.ts`、`tests/pages-surface-naming.test.ts` 改用 `tests/fixtures/pages-host.ts`；`tests/shell-page-gate.test.ts` 里「整页生产者」名单里的导出 HTML 一行改指 `src/browser/document.ts`。
- 页面资源：`/assets/molis-work-plugins/pages.js` 由 49,137 降到 38,751 字节，`/assets/molis-work-pages-editor.js` 由 710,405 降到 709,628 字节（`tooling/gates/page-assets.json` 同步）。
- 浏览器用例里模拟传输的两处原先包 `window.fetch`，页面的请求现在走帧内的 `molisWorkRequest`（`fetch` 在帧启动时已被它捕获），改成包 `molisWorkRequest`：`tests/pages-import-entry.e2e.test.ts` 的 413 替身与删除被拒的替身（照共享助手报告被拒请求的样子抛出带状态、代码和说明的 Error）、`tests/content-editing-regressions.e2e.test.ts` 的 `holdReply`（等真实答复回来后扣住解析好的内容）；断言一条没有改。
- 行为不变：README「改动后必跑」的单元用例全部通过；本机已跑的浏览器用例全部通过：`tests/pages-assistant-surfaces.e2e.test.ts`（1/1）、`tests/pages-actions.e2e.test.ts`（3/3）、`tests/pages-import-entry.e2e.test.ts`（6/6，含合并 main 后新增的短窗口用例）、`tests/pages-publication.e2e.test.ts`（2/2）、`tests/workbench-deferred-clients.e2e.test.ts`（3/3）、`tests/contextual-pages-goals.e2e.test.ts`（3/3）、`tests/content-editing-regressions.e2e.test.ts`（9/9）、`tests/plugin-small-ux.e2e.test.ts`（16/16）、`tests/missing-item-feedback.e2e.test.ts`（3/3）、`tests/workbench-async-targets.e2e.test.ts`（6/6）、`tests/goal-event-document.e2e.test.ts`（6/6）、`tests/security-invariants-plugin-pages.e2e.test.ts`（5/5）。其余见 PR 说明里的「待测（交 Codex 测试专职）」。

## 合并提示

叠在 Workflows 片（`ac-clients-workflows`）之后。与 PPT 片（#1217）、Form 片（#1219）共用三个文件，各改各的行：`pnpm-lock.yaml`（各自插件的 `devDependencies` 块，相邻）、`specs/BACKLOG.md`（各自的 BL 行，相邻）、`tooling/gates/page-assets.json`（各自资源的一行）。谁后合入谁解一下文本冲突，不涉及取舍；`page-assets.json` 的数字以合并结果上重新构建后的实测为准（`node scripts/gates/page-assets.mjs --update --base origin/main`）。

## 登记的遗留

- BL-464：编辑器内核自己的标签仍按中文原文查词、评论侧栏仍有一处原生 `fetch(`、`src/en.ts` 保留的 202 条。
