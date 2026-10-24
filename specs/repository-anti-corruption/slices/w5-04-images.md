# W5-04 Images 片：打包的、类型检查的客户端

状态：执行中（2026-10-23）。Images 的页面客户端及评审补修已完成；本地构建和定向验证通过，待 CI 与统筹集成全量。翻译半边（稳定键 `images.*`）早由 #751 做完，本片只补打包与请求。

验收编号：RAC-142～143。

## 范围

`plugins/native/images/`：客户端从一份 458 行的模板字符串改成 `src/browser/` 的 TypeScript（`types`、`dom`、`request`、`page`、`list`、`result`、`connections`、`jobs`、`compose`、`commands`、`client`、`factory`，每个函数都在 150 行以内），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/images-client.js`；`src/client.ts` 只读这份包。页面状态在一个 `ImagesPage` 里，各部件（历史列表、结果、服务框、提交、按钮命令表）各自一个模块。

请求：原先自己拼 `life.fetch` 与 `molisWorkControlHeaders()`，现在经共同的 `molisWorkRequest`（带 `scope`，离开页面即取消），失败仍是带 `code` 和 `status` 的 Error。仅提交图片任务的 POST 没有收到可确认答复（`status` 0、答复读到一半、或 200 正文不是 JSON）时，只显示「提交结果未确认……」那句，不再接 `fetch` 的英文报错；同样的文字再点生成仍复用同一个 `request_id`。

行为改动：「放进 Shelf」按钮 1.2 秒后恢复，原先用 `setTimeout`，现在用页面的 `life.timeout`，视图已卸载时不再碰按钮。

评审补修（2026-10-23）：Host 与 Scope 从公共 `UiPluginClientHost`、`UiClientScope` 取类型；Scope 保留共同请求器实际消费的 fetch。仅 type-only 引入 SDK 的浏览器全局声明，esbuild 声明为本包直接开发依赖。请求、图片地址和助理上下文的插件身份来自 Host。85 条 Images 稳定键与中英文保持不变；页面资源仅提交实测降低值。

服务端错误模型测试只排除 `plugins/native/<name>/src/browser/`：解析各包真实 tsconfig，核对排除文件不在根文件集合，也不通过 import/export 进入 TypeScript Program；原三条错误模型拒绝断言保持。

不动 `manifest.ts`（#1098）和 `actions.ts`（#1117）。

## 验收

- RAC-142：`ui.ts` 与 `src/browser/` 用到的每个 `images.*` 键都有中英文且占位符一致，登记的键没有多余；用仓库真实翻译扫描器 scanTree 核对调用，动态稳定键按实际取值枚举；`ui.ts` 画出的页面没有直接写入的中文；翻译器调用里只有与别的主人共用的两句放置提示（`来自 {source}`、`可以在 Shelf 里用于项目`）还是中文原文（`tests/images-client-bundle.test.ts`）。
- RAC-143：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，构建跑浏览器类型检查，包是 `(host) => {…}` 函数表达式，带 `data-assistant-context`、`molis:placement-result`，请求经 `molisWorkRequest`（`tests/images-client-bundle.test.ts`）。`tests/images-plugin.e2e.test.ts` 通过受控本地 provider 验证真实 jobs POST 返回 202 已受理后，将该回执替换为 200 坏 JSON，共同请求器产生 invalid_response：页面显示未确认，pending 的 request_id/fingerprint 保留；同输入重试沿用原 ID，只有一条任务与一次厂商调用，确认成功后清空 pending。服务端错误模型排除边界由 `tests/shelf-jelly-cognia-images-error-model.test.ts` 验证。
- 页面资源：`/assets/molis-work-plugins/images.js` 由 21,670 降到 19,877 字节（原 PR 为 19,915，评审补修再减 38）（`tooling/gates/page-assets.json` 同步）。
- 行为不变：README「改动后必跑」与首次连接定向回归（`tests/images-actions.e2e.test.ts`）通过。


## 评审补修验证（2026-10-23）

RAC-142：真实扫描覆盖 108 处调用（页面 46、浏览器 62），没有未解析的动态键；85 条中英文保持不变。RAC-143：共同 Host/Scope、SDK 全局声明与直接构建依赖通过整体构建；服务端错误模型 13 项、真实受理后坏 JSON 与同请求重试 2 项通过。README 定向、翻译与资源预算合计 16 个实际文件、最终观察 324/324 通过。首批新浏览器场景误将真实 202 受理回执断言为 200，改为明确注入 200 坏 JSON 后原文件 2/2 通过；命令误写的资源预算文件没有运行，随后实际预算文件 171/171 通过。这些是测试修订，不改生产行为或放宽断言。

包边界与公开 API 快照通过；页面资源按构建实测同步，只降低 Images 的预算，共同插件 frame 的 +88 字节沿用 #1129 尚未消费的放行。未调用真实付费厂商，不代表一骏本人验收；共享核心的全量由统筹集成批负责。
