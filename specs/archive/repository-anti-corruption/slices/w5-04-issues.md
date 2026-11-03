# W5-03 / W5-04 Issue 片：稳定翻译键与打包的客户端

状态：执行中（2026-10-23）。Issue 的页面客户端和静态文字按 Todo 片（#1129）的做法改完，#1132 评审修复及本地验证完成；CI 与共享集成全量仍待完成。

验收编号：RAC-138～139。

## 范围

`plugins/native/issues/`：客户端从 4 份模板字符串（主页面、截图、整理、重新整理，约 500 行）改成 `src/browser/` 的 TypeScript，`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/issues-client.js`；样式表放进同一个包（`--define:ISSUES_CSS`，由 `tooling/minify-styles.mjs` 压缩，样式源在 `src/styles.ts`）。页面文字改成稳定键 `issues.<区域>.<名称>`，中英文在 `src/messages.ts`，登记在 `registration.ts` 的 `messages`；`ui.ts` 通过视图模型里的 `primitives.text` 直接画出译文，不再靠浏览器里的 `data-issue-i18n` 逐个翻译。82 个键保持原生效英文（69 条整句、12 条组合句与 Bug）；清理缺口表里经实际翻译扫描判定已无调用的 43 条 Issue 条目，保留 7 条服务端动态错误、追问与跨页面活跃词条；该段之外仍在用的「请描述问题或添加图片」与截图追问保持原样。

请求：原先自己拼 `scope.fetch` 与控制头，现在经共同的 `molisWorkRequest`（带 `scope`，离开页面即取消），失败仍是带 `code` 和 `status` 的 Error；写操作没有回执时说「可能已经生效」的口径不变。

2026-10-23 评审补修：复用 #1129 的公开 Host/Scope 合同与 SDK 请求全局类型，插件路由从 Host 获取，esbuild 声明为直接开发依赖；不更改动作合同或记录身份。非拒读错误仍经翻译器，读拒绝与取消行为保留。只有有副作用的 POST 在 JSON 回执损坏时提示结果未知，保留原状态与错误码；后台起名先按草稿 ID 读回已经保存的记录，手动保存保留发送前的同一草稿 ID，重试先核对而不重复写入。GET 和只读重新起名不说写入成功与否未知。只清理已消费资源放行，保留依赖 #1129 尚未消费的 frame 放行与本片实测必要增长。

不动 `manifest.ts`（#1098）；不改门禁算法、权限或业务写入合同。

## 验收

- RAC-138：页面用到的每个 `issues.*` 键都有中英文且占位符一致，登记的键没有多余；`ui.ts` 画出的页面没有直接写入的中文，不再有 `data-issue-i18n`；`ui.ts` 的局部入口由 `t` 统一为既有扫描器支持的 `L`，使用实际 `scanTree` 覆盖 UI 和 browser 的翻译调用，静态调用没有中文原文，动态稳定键仍逐键验证；英文 Home 读不存在记录的服务端错误仍显示英文（`tests/issues-client-bundle.test.ts`、`tests/issue-home-locale.e2e.test.ts`）。
- RAC-139：浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`，构建跑浏览器类型检查，包是函数表达式并带压缩后的样式表（`tests/issues-client-bundle.test.ts`）。写入实际提交但回执为坏 JSON 时，手动补录保留图文、提示未知并保留 ID，重试只读回原记录；后台起名同样读回已有记录，不留失败草稿（`tests/issue-manual-save.e2e.test.ts`）。
- 行为不变：保留服务端错误翻译、读拒绝与生命周期取消。`tests/issue-*.test.ts` 与 `tests/issue-*.e2e.test.ts` 在 CI 全量中通过。


2026-10-23 本地验证：整体构建通过，README 必跑加共同请求、缺失条目反馈、翻译和资源预算，共 19 个文件最后一次结果 347/347。英文 Home 真实读取不存在记录、手动提交与后台起名完成后坏 JSON 的恢复均通过。初轮发现旧手写重挂载 Host 缺 `pluginRoute`，已按真实语义补齐且保留隐藏/移除/重复挂载断言；英文新增用例改用 Home 完整页的公开选中事件，经原桥接读取。健康门禁、边界、公开 API 与实际资源预算通过。Issues 资源 24,145 → 27,806 B（+3,661），相对初版批准额多 56 B，用于结果未知恢复；主审已批准精确单次条目，沿用 #1129 尚未消费的 frame +88 B。PG-071 的本片页面静态词条已迁移并删除死键，服务端动态词条仍由现行词典翻译；不宣称整条 W5-03/04 完成。共享全量由集成批覆盖，真实模型质量与用户体验验收未替代。
