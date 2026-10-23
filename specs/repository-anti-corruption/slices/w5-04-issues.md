# W5-03 / W5-04 Issue 片：稳定翻译键与打包的客户端

状态：执行中（2026-10-23）。Issue 的页面客户端和静态文字按 Todo 片（#1129）的做法改完，本地验证通过，待 CI。

验收编号：RAC-138～139。

## 范围

`plugins/native/issues/`：客户端从 4 份模板字符串（主页面、截图、整理、重新整理，约 500 行）改成 `src/browser/` 的 TypeScript，`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/issues-client.js`；样式表放进同一个包（`--define:ISSUES_CSS`，由 `tooling/minify-styles.mjs` 压缩，样式源在 `src/styles.ts`）。页面文字改成稳定键 `issues.<区域>.<名称>`，中英文在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`；`ui.ts` 通过视图模型里的 `primitives.text` 直接画出译文，不再靠浏览器里的 `data-issue-i18n` 逐个翻译。英文逐字照搬工作台缺口表（`renderer-gap-en.ts`）里原有的那几十句。

请求：原先自己拼 `scope.fetch` 与控制头，现在经共同的 `molisWorkRequest`（带 `scope`，离开页面即取消），失败仍是带 `code` 和 `status` 的 Error；写操作没有回执时说「可能已经生效」的口径不变。

不动 `manifest.ts`（#1098）。

## 验收

- RAC-138：页面用到的每个 `issues.*` 键都有中英文且占位符一致，登记的键没有多余；`ui.ts` 画出的页面没有直接写入的中文，不再有 `data-issue-i18n`；翻译器调用里没有中文原文（`tests/issues-client-bundle.test.ts`）。
- RAC-139：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`，构建跑浏览器类型检查，包是函数表达式并带压缩后的样式表（`tests/issues-client-bundle.test.ts`）。
- 行为不变：`tests/issue-*.test.ts` 与 `tests/issue-*.e2e.test.ts` 在 CI 全量中通过。
