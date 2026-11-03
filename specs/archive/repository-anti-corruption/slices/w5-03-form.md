# W5-03 Form 片：稳定翻译键

状态：执行中（2026-10-24）。Form 的页面文字全部改成稳定键，页面里的动态翻译清零；页面客户端早已是打包、类型检查的 TypeScript（W4-04 第 4 片，`#558`），本片给它补上与 Dataset 同款的钉住测试。本地构建和定向验证通过，待评审与统筹集成全量。从 main 起，不叠在别的片上（做法与 Dataset 片 `w5-03-dataset.md`、PPT 片 `w5-03-ppt.md` 相同，只在共享的测试文件和 `pnpm-lock.yaml` 之外没有重叠，见「合并提示」）。

验收编号：RAC-154～155。

## 范围

`plugins/native/form/`：

- 页面文字：`ui.ts` 里 54 处 `p.text("中文")` 和 `src/browser/` 里的 117 处 `L("中文")` / `page.L("中文")`，改成 118 个稳定键 `form.<区域>.<名称>`（`src/messages.ts`，中英文并排，登记在 `registration.ts` 的 `messages`，从 `index.ts` 导出 `FORM_MESSAGES`）。
- 两处查表翻译改成逐条写出的选择，页面里不再有动态翻译：`status.ts` 的收集状态（原 `L(COLLECT[record.status] || COLLECT.draft)`）和 `results.ts` 的答卷来源（原 `L(SOURCE[key] || key)`；不认识的来源仍照原样显示）。
- 拼出来的句子改成带占位符的整句：列表里的题数（原 `N + " " + L("题")`）、结果页的答卷数（原 `N + " " + L("份答卷")`）。
- `src/en.ts` 从 136 条减到 51 条（BL-462）：保留服务端标签与错误、导出填写页文件里的来源词、别的主人在查或提到的词；删掉的 85 条里，68 条是页面自己的词（现在是键），2 条（`题`、`份答卷`）已换成整句，15 条在整个仓库里没有任何调用。
- `tests/form-client-bundle.test.ts` 新增：同 Dataset、PPT 的两条验收，Form 的页面里没有动态翻译。

不动 `src/browser/` 的结构与行为（只换翻译调用的参数）、`manifest.ts`、`actions.ts`、`plugin.ts`、`store.ts`、`styles.ts`、`fillpage.ts`（导出的填写页文件有自己的 `say(key, 默认)` 机制，不在本片）。不改工作台与别的主人的文件、别片的规格。

## 英文显示的变化（逐条）

Form 自己的页面，116 个键的英文与原来显示的完全一样（取合并后的英文词典对该中文原文的答案；Form 的词被别的主人的同名词压过的，也按压过之后的显示算）。仅有的变化是两句带数量的话（原来是数字加一个词拼出来的）：

- 列表里一份问卷的题数：原来 `N questions`，数量为 1 时是 `1 questions`；现在 `1 question`。其余数量不变。
- 结果页的答卷数：原来 `N submissions`，数量为 1 时是 `1 submissions`；现在 `1 submission`。其余数量不变。

别的主人的页面一条没变。删除 `src/en.ts` 里 85 条之后，用合并后的英文词典（工作台 `i18n/en.ts`）逐键比对删除前后：没有任何键的英文改变；消失的 79 个键是 68 个已成为稳定键的页面词、`题` 与 `份答卷`（已换成整句）和 9 个在整个仓库里没有任何调用的词（`标记已发布`、`发布状态保存在本机，不会生成外网填写链接。`、`先建一份，再加题目。预览里可以自己填一遍，看结果。`、`按提示加一题`、`加题`、`发布`、`JSON`、`建问卷，预览填写，看结果。`、`收集答卷不需要网络：…`）；另有 6 个同样没有调用的词（`恢复发布`、`存为成果` 等）别的词典定义了同样的英文，仍在。有调用或提到的都留在 `src/en.ts`。

## 验收

- RAC-154：`ui.ts` 与 `src/browser/` 用到的每个 `form.*` 键都有中英文且占位符一致，登记的键没有多余；用仓库真实翻译扫描器 scanTree 核对调用，没有中文键，没有未解析的动态键；`ui.ts` 画出的页面没有直接写入的中文（`tests/form-client-bundle.test.ts`）。
- RAC-155：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 和 `/api/plugins/` 前缀；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:placement-result`、`molis:placement-changed`、`molis-work:model-ready`、`form.save.saved`、`form.conflict`；请求经 `molisWorkRequest`（`tests/form-client-bundle.test.ts`）。原先断言里写着中文原文的几处（`tests/creative-tools-plugins.test.ts` 里 `还有必填题没填`、`载入中`、`固定版本`）改读键，断言的意思没变。
- 页面资源：`/assets/molis-work-plugins/form.js` 由 30,112 降到 29,708 字节（`tooling/gates/page-assets.json` 同步）。
- 行为不变：README「改动后必跑」的单元用例与 Form 相关的浏览器用例（`tests/form-actions.e2e.test.ts`、`tests/form-question-reflow.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`）见 PR。

## 合并提示

`tests/creative-tools-plugins.test.ts` 同时是 PPT 片（`w5-03-ppt.md`，#1217）要改的文件，改的是各自插件的相邻几行：谁后合入谁解一下文本冲突，不涉及断言的取舍。

## 登记的遗留

- BL-462：Form 的 `src/en.ts` 保留的 51 条（含一条只因 #1217 之前 PPT 的页面还在查而留的词，#1217 合入后可删）。
