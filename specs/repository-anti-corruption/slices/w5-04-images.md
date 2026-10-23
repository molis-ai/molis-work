# W5-04 Images 片：打包的、类型检查的客户端

状态：执行中（2026-10-23）。Images 的页面客户端按 Todo 片（#1129）的做法改完，本地验证通过，待 CI。翻译半边（稳定键 `images.*`）早由 #751 做完，本片只补打包与请求。

验收编号：RAC-142～143。

## 范围

`plugins/native/images/`：客户端从一份 458 行的模板字符串改成 `src/browser/` 的 TypeScript（`types`、`dom`、`request`、`page`、`list`、`result`、`connections`、`jobs`、`compose`、`commands`、`client`、`factory`，每个函数都在 150 行以内），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/images-client.js`；`src/client.ts` 只读这份包。页面状态在一个 `ImagesPage` 里，各部件（历史列表、结果、服务框、提交、按钮命令表）各自一个模块。

请求：原先自己拼 `life.fetch` 与 `molisWorkControlHeaders()`，现在经共同的 `molisWorkRequest`（带 `scope`，离开页面即取消），失败仍是带 `code` 和 `status` 的 Error。提交图片任务没有收到答复（`status` 0，或答复读到一半）时，只显示「提交结果未确认……」那句，不再接 `fetch` 的英文报错；同样的文字再点生成仍复用同一个 `request_id`。

行为改动：「放进 Shelf」按钮 1.2 秒后恢复，原先用 `setTimeout`，现在用页面的 `life.timeout`，视图已卸载时不再碰按钮。

不动 `manifest.ts`（#1098）和 `actions.ts`（#1117）。

## 验收

- RAC-142：`ui.ts` 与 `src/browser/` 用到的每个 `images.*` 键都有中英文且占位符一致，登记的键没有多余；`ui.ts` 画出的页面没有直接写入的中文；翻译器调用里只有与别的主人共用的两句放置提示（`来自 {source}`、`可以在 Shelf 里用于项目`）还是中文原文（`tests/images-client-bundle.test.ts`）。
- RAC-143：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，构建跑浏览器类型检查，包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:placement-result`，请求经 `molisWorkRequest`（`tests/images-client-bundle.test.ts`）。
- 页面资源：`/assets/molis-work-plugins/images.js` 由 21,670 降到 19,915 字节（`tooling/gates/page-assets.json` 同步）。
- 行为不变：README「改动后必跑」与首次连接定向回归（`tests/images-actions.e2e.test.ts`）通过。
