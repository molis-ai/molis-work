# W5-03/04 Dataset 片：稳定翻译键与打包、类型检查的客户端

状态：执行中（2026-10-24）。Dataset 的页面文字全部改成稳定键，页面客户端改成打包、类型检查的 TypeScript；本地构建和定向验证通过，待评审与统筹集成全量。从 main 起，不叠在别的片上（与灵光片 `w5-04-lingguang.md` 各改各的包，只在共享的测试文件里有相邻行的文本冲突，见「合并提示」）。

验收编号：RAC-150～151。

## 范围

`plugins/native/dataset/`：

- 页面文字：`ui.ts` 里 38 处 `p.text("中文")` 和客户端里的翻译调用，改成 75 个稳定键 `dataset.<区域>.<名称>`（`src/messages.ts`，中英文并排，登记在 `registration.ts` 的 `messages`）。拼出来的句子（列表里的「N 列 × M 行」、默认列名「列 N」）改成带占位符的整句，不再在代码里拼英文。
- 客户端：从一份 700 行的模板字符串改成 `src/browser/` 的 TypeScript（`types`、`dom`、`request`、`page`、`status`、`table`、`list`、`editor`、`commands`、`record-commands`、`table-commands`、`file-import`、`events`、`factory`），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/dataset-client.js`；`src/client.ts` 只读这份包。页面状态在一个 `DatasetPage` 里，各部件（状态、表格、列表、编辑与保存、按钮命令表、文件导入、外部事件）各自一个模块。原先 200 行的点击处理拆成一张命令表，按原来的先后顺序找第一个点中的控件，需要打开着一张表的命令在没有表时跳过。
- 合并函数：`mergeDatasetDraftRows` 不再用 `toString()` 拷进脚本，页面代码直接 import 同一份源码（`src/row-merge.ts`，类型改成泛型与只读，行为不变，包的导出不变）。
- 请求：原先自己拼 `fetch(withProject(host.route(path)), {headers: molisWorkControlHeaders()})`，现在经共同的 `molisWorkRequest`，失败仍是带 `code` 的 Error，冲突仍说「数据表已在别处修改…」。路径来自 `host.pluginRoute("/datasets…")`、项目来自 `host.projectId()`；助理上下文里的 `plugin_id` 来自 `host.pluginId`；浏览器代码里不再写 `io.molis.work.dataset` 和 `/api/plugins/…`。
- `src/en.ts` 只留 15 条宿主仍按中文原文翻译的词（BL-460）；esbuild 是包的直接开发依赖，版本与根相同（`pnpm-lock.yaml` 同步）。
- 行为保持：保存队列与未保存状态、冲突保留本地输入并阻止切表、筛选下的行合并、列与行的增删（首列带三行空行）、CSV 粘贴与文件导入（≤2 MB，导入占用编辑器，表被移走后迟到的读取作废）、导出 CSV/JSON、版本与回滚、固定版本与「未存完」恢复、AI 加列的可用性、`molis:placement-changed` 与 `molis-work:model-ready` 的重读、离开前的未保存提示，逻辑逐段照搬。页面不新增生命周期（仍不用挂载作用域），请求也不带 `scope`，与 Form 的做法一致。

不动 `manifest.ts`、`actions.ts`、`plugin.ts`、`store.ts`、`styles.ts`。不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

Dataset 自己的页面，73 个键的英文与原来显示的完全一样（取合并后的英文词典对该中文原文的答案；Dataset 的词被别的主人的同名词压过的，也按压过之后的显示算；默认列名 `列 N` 由拼接改成整句，英文仍是 `Column N`）；其余 2 处变化如下，别的主人的页面一条没变：

- 确认导入的按钮（`导入`）：原来显示 `Imported`（别的主人对同一句中文的译法压过了 Dataset 自己写的），现在是 `Import`。
- 列表里一张表的大小：原来是三段拼起来，英文成了 `3 Column × 5 rows`（「列」取了用作列名前缀的译法）；现在是整句，`3 columns × 5 rows`，数量为 1 时是 `1 column × 1 row`。

`src/en.ts` 原有 85 条：70 条没有别的主人在查（其中 11 条原本就没有任何调用），页面改成稳定键后删除；留下的 15 条是 Dataset 的服务端标签与错误，以及别的主人在查或提到的词（见 BL-460）。逐条核对过合并后的英文词典（工作台 `i18n/en.ts`）：删除后，除上面这一组 Dataset 页面自己的词，没有任何别的键的英文变化或消失，有调用或提到的都留在 `src/en.ts`。

## 验收

- RAC-150：`ui.ts` 与 `src/browser/` 用到的每个 `dataset.*` 键都有中英文且占位符一致，登记的键没有多余；用仓库真实翻译扫描器 scanTree 核对调用，没有未解析的动态键，没有中文键；`ui.ts` 画出的页面没有直接写入的中文（`tests/dataset-client-bundle.test.ts`）。
- RAC-151：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:placement-result`、`molis:placement-changed`、`molis-work:model-ready`、`dataset.conflict`；请求经 `molisWorkRequest`（`tests/dataset-client-bundle.test.ts`）。原先靠正则读脚本文字的几处断言（`tests/creative-tools-plugins.test.ts`、`tests/list-silent-refresh.test.ts`、`tests/creative-artifact-promote.test.ts`、`tests/personal-plugins-review-fixes.test.ts`）改成读 `src/browser/` 的源码，页面行为由浏览器用例（`tests/dataset-actions.e2e.test.ts`、`tests/dataset-file-import.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`）在真实页面上走。
- 页面资源：`/assets/molis-work-plugins/dataset.js` 由 25,517 降到 23,851 字节（`tooling/gates/page-assets.json` 同步）。
- 行为不变：README「改动后必跑」的单元用例，与六份浏览器用例（`tests/dataset-actions.e2e.test.ts`、`tests/dataset-file-import.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/request-failure-call-id.e2e.test.ts`、`tests/status-ring.e2e.test.ts`、`tests/work-placement-plugins.e2e.test.ts`）通过。页面请求现在经 `molisWorkRequest`，旧测试拦 `window.fetch` 的两处（保存顺序、导入请求）改成拦 `window.molisWorkRequest`（与 `tests/form-actions.e2e.test.ts` 同一写法），断言一条没动。

## 合并提示

`tests/creative-tools-plugins.test.ts`、`tests/list-silent-refresh.test.ts`、`tests/personal-plugins-review-fixes.test.ts` 同时是灵光片和后面各片要改的文件，改的是各自插件的相邻几行：谁后合入谁解一下文本冲突，不涉及断言的取舍。

## 登记的遗留

- BL-460：Dataset 的 `src/en.ts` 保留的 15 条（服务端标签与错误、别的主人在查或提到的词）。
