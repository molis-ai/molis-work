# Shelf 置物架入口

文件入库与提取任务沿原 Action 传递 signal/beforeEffect；PDF 预览、文字层和 OCR 由 Host 注入公共材料口。所有选中材料逐项提取并保留不完整提示，取消/撤权/副本变化不保存迟到结果或失败成果。视觉布局不变。

把 DropAgent 的材料 / 结果 / 剪贴板工作台挂进 Molis 目录与主工作面，视觉与交互跟 DropAgent。

包名：`@molis-ai/molis-work-plugin-shelf`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

页面经插件自己的路由（Manifest 声明，[src/routes.ts](src/routes.ts)；Home 页 `/api/plugins/io.molis.work.shelf/…`，项目页 `/projects/<id>/api/plugins/io.molis.work.shelf/…`）读快照、放入材料、跑任务、取文件，每条路由绑一个动作；Host 不再有 `/api/shelf`。快照带上本机 Agent 状态和整张 Recipe 表，动作栏按选中材料挑该用的动作。插件不写项目 Goal。在项目内可预览并确认「存到项目资料」：Shelf 经成果库公开的文件导入动作（`ARTIFACT_FILE_IMPORT_ACTION`，`src/home-plugin.ts`）把当前完整文字存成项目成果库里的一份导入文档，项目里的 Agent 都能经项目资料（`knowledge.*`）找到，人也能在输入框的项目资料选择器里选它。重复保存未变正文复用版本，编辑产生新版本；个人架子的编辑、隐藏或移除不改项目里存下的那一份。PDF/图片先使用已有提取动作转成文字。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。

| 文件 | 用途 |
| --- | --- |
| [src/ui.ts](src/ui.ts) | 目录与工作面 HTML |
| [src/styles.ts](src/styles.ts) | DropAgent 表面样式 |
| [src/browser/](src/browser) | 页面的客户端（TypeScript，`tsconfig.browser.json` 检查，esbuild 从 `factory.ts` 打成 `dist/shelf-client.js`）：选择、多选、动作栏（`bar.ts`）、确认（`confirm.ts`）、运行（`run.ts`）、与打开的项目交换（`result.ts`）；页面状态在一个 `ShelfPage` 对象里（`types.ts`），请求只经 `molisWorkRequest`（`request.ts`） |
| [src/browser/settings/](src/browser/settings) | 设置页的客户端，打成 `dist/shelf-settings-client.js`，由 [src/settings-client.ts](src/settings-client.ts) 在前面放热键表和路由后交给设置页 |
| [src/client.ts](src/client.ts) | 读 `dist/shelf-client.js`，交给工作台的工厂 `SHELF_CLIENT_FACTORY_SCRIPT` |
| [src/messages.ts](src/messages.ts) | 页面文字的稳定键（中英文），`tests/shelf-client-bundle.test.ts`（RAC-164 至 RAC-166）钉住 |
| [src/routes.ts](src/routes.ts) | HTTP 路由表 |
| [src/settings-ui.ts](src/settings-ui.ts) | 六段用途堆叠的设置页 |
| [src/terminal-client.ts](src/terminal-client.ts) | 「对话」的终端井，接 `/pty` |

可对照 [apps/workbench/src/shell-page-renderer.ts](../../../apps/workbench/src/shell-page-renderer.ts) 与 [src/route-handlers.ts](src/route-handlers.ts)。

## 接入与边界

不依赖 Goals / Artifacts 实现。存进项目的文字是项目里的导入文档，由 Host 以调用者身份写入；全局 Shelf 未绑定项目时不能保存；个人副本由 Home 实例管，项目一半（存到项目资料、接收 Coding 成果）由 `createShelfPlugin` 在正式 Runtime 中启动，使用原 grants 与持久连线服务。样式不吃 Coss `interaction-texture`，新确认入口使用共享控件。

项目内通过「更多 → 接收项目成果」接收 Coding 固定报告或固定变更。`coding-report` / `coding-changeset` 可选输入只提供候选，用户查看完整正文并明确接收后才创建个人副本；项目其他已保存成果也可选择。Host 校验生产者与固定身份，提交时重读原对象并核对预览指纹，浏览器不能提交替代正文。副本保存原项目、精确版本与内容指纹，提供「查看原固定成果」；再次接收同一版本复用已有副本并保留编辑。归档或不可用来源拒绝新接收，已有副本独立保留。之后保存项目材料仍携带原来源，不自动执行或验收 Goal。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

```bash
pnpm --filter @molis-ai/molis-work-plugin-shelf typecheck
pnpm --filter @molis-ai/molis-work-plugin-shelf build
pnpm test:run tests/shelf-plugin.test.ts tests/shelf-project-knowledge-http.test.ts tests/shelf-project-results-http.test.ts tests/shelf-plugin.e2e.test.ts
```

## 开发要求

- 负责：Shelf 目录、预览与副本任务界面。
- 不负责：Goal 与 Artifact 的事实和 Store、桌面轮盘与热键。
- 公开入口：`@molis-ai/molis-work-plugin-shelf`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-module-shelf`、`@molis-ai/molis-work-plugin-sdk`（`bindOwnerPluginAction`、`bindPluginActionRoute`）；第三方依赖见 `package.json`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 架子的文件声明是 `SHELF_OWNER_FILES`（`catalog.json`、`files/`、`jobs/`，插件包导出）。Home 动作和项目里的动作（存到项目资料、接收项目成果）都由 Shelf 的 Runtime 实例提供（`src/registration.ts` 的 `runtime: { scope: "home", dual_instance }`，文件声明在 `src/manifest.ts` 的 `owner_files`，`src/home-plugin.ts`），文件走平台的 `services.ownerFiles`；Host 不再按这份声明装配自己的文件客户端（Shelf S4 删了 `shelf-actions.ts`，PG-026-S1），演示数据的示例由常驻宿主调 Shelf 的 `shelf.sample.seed` 放回（`apps/local-host/src/demo-plugin-seed.ts` 的 `seedDemoHomeSamples`，Shelf 没装上、没在跑或没授权就不动，演示照常做好）；动作端口里改架子的方法返回 `T | Promise<T>`，处理器都 `await`。
  - 文件夹放入整个不超过 32 MB（各文件之和；Store、桌面壳 `shelf_http.rs` 与面板三处同一个数，超了整个拒绝并说「拆成几个小一点的文件夹」，Shelf S3 起由 64 MB 改小；文件夹路由的请求体上限 45 MB，留给 base64 的膨胀）。
  - 放入只收字节，调用方不再给真实路径（`shelf.items.admit@2`、`shelf.items.admit-folder@2`）；「原件已变」的提示只对经 `shelf.items.original`（仅本机界面，`materials:original`）登记过原件的材料有效，原件路径由平台的 `materials.claimOriginal` 保管，Shelf 只记哈希（① 裁定 D3）。抓网页是单独的 `shelf.items.capture`（`materials:fetch` + `materials:fetch_local`），`admit@2` 只要 `shelf:write` 与 `materials:read`（D8）。
  - 预览：PDF 与 PNG、JPEG、WebP、GIF 由工作台的 `host.loadMedia` 取插件路由 `shelf.file` 的字节显示（PDF 先核对文件头）；其他格式显示抽取出的文字，加「下载这份文件」和（桌面壳里）「用系统打开」。
  - 不依赖 Goals 或 Artifacts 实现；交给项目的文字材料是过程项，由 Host 注入的公开端口写入，未绑项目时不能发布。
  - 个人架子的编辑、隐藏或移除不改项目里的旧版本。
  - 首次打开时架子里放着一份「试用示例.pdf」，是有意的首次使用引导，不是演示数据：只在架子从未放过任何材料时，由 Home 实例在自己的 `start` 里（`createHomeShelfPlugin`，`files.write(initializeShelfFiles)`，动作之外凭安装现行授权）放一次，读快照不写（`seeded_sample`；删掉以后重启实例、重新授权也不放回；放入任何材料或示例本身之后，用户删除、隐藏都不会自动放回，设置里的「使用指南」可由用户主动再放一份），写在用户 Home 的个人架子里，不进任何项目库，不读不写用户的内容。它让「提取文字、拖走结果」在没有 Agent、没有授权、没有网络时也能走完一遍（[Shelf 插件需求](../../../specs/archive/shelf-plugin/spec.md)「动作与引导」）。保留是 W2-18 决定 12（2026-10-09）：不改成空状态按钮，不删除。
  - 提交时 Shelf 重读原对象并核对预览指纹，浏览器不能提交替代正文。
  - 项目成果（Coding 的固定报告与变更）：Shelf 自己列（`services.artifacts.listConsumable()` 按 Manifest 声明的消费类型筛，加上输入端口接着的版本）、自己读（`services.artifacts.read`），正文向 Coding 要（Manifest `capabilities.consumes` 声明 `coding.results.document@1`，权限 `artifact:read`，经 `services.actions.invoke`；定义只在合同包 `@molis-ai/molis-work-contracts/modules/coding` 一处，Shelf 与 Coding 都从那里取，Shelf 里没有第二份，`tests/shelf-coding-results.test.ts` 的 W5-01-CODING-09 钉住 Shelf 的 Manifest 消费它的 id、Coding 的 Manifest 声明的是同一个对象）。副本的标题说明、来源和指纹由 Shelf 拼（`shelfCopyOf`），宿主不拼。只在项目里装了 Coding 时才有正文，没装是平台的 `actions.plugin_disabled`。宿主只给 `ShelfResultPorts` 两样：`projectPath()`（副本来源里要写项目页面的服务路径，只有宿主知道）和 `receive`（写入口，随 Shelf S3、S4 的宿主装配一起删）。
  - 旧确认不能覆盖后来的选择；跨项目、已归档或非自身的材料不能设为输出。
  - URL 入库和剪贴板转材料必须将 Action signal / beforeEffect 传到 Module；抓取后复查再保存，源剪贴板已删除时不能生成迟到材料。
  - 网页只抓公开地址和本机回环：本机页面经 `materials.readLocalPage`，其余经 `materials.readSource`；局域网地址不抓（① 裁定 D5，2026-10-22）。
  - 用 AI 处理经 `services.model`（`src/ai.ts`），材料经 `services.materials` 提取；任务的冻结副本经 owner files 读，不把真实路径交给模型或外部工具。
  - 失败都是 `ActionError`：码是 `shelf.<原因>`（`shelfErrors`，声明在 Shelf 模块 `modules/shelf/src/errors.ts`，因为模块和本插件都用它）；状态只由 kind 推出，本插件没有错误类和状态表。失败的任务随错误带回整份置物架快照（`snapshot` 在响应体顶层，紧挨 `error` 和 `code`），面板据此重画那一行失败记录。生成动作没有可用文字模型时，目录里写的是平台的 `actions.connection_required`（和 Jelly、Todo、Form、Dataset 一样），不再是 `shelf.no_model`；任务已经开始后才发现没有模型选择，仍抛 `shelf.no_model`（409）。
- 改动后必跑：`node scripts/run-tests.mjs tests/shelf-plugin.test.ts tests/shelf-actions.test.ts tests/shelf-owner-files.test.ts tests/shelf-project-knowledge-http.test.ts tests/shelf-project-results-http.test.ts tests/shelf-terminal-recovery.test.ts tests/shelf-jelly-cognia-images-error-model.test.ts tests/plugin-host-services.test.ts tests/shelf-coding-results.test.ts tests/shelf-coding-results-platform.test.ts tests/shelf-ai-host.test.ts tests/shelf-catalog-maintenance.test.ts tests/dual-instance-coverage.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/shelf-plugin.e2e.test.ts`
- 相关手册：[docs/modules/shelf.md](../../../docs/modules/shelf.md)、[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)
- [Shelf 插件需求](../../../specs/archive/shelf-plugin/spec.md)


Agent 列表与页面刷新不启动本机 CLI。人工终端保留全部引擎；自动动作通过独立 AI 模型选择和共享 Prologue。确认页说明材料会发给所选模型、可能计费、原件不变以及无终端写入工具。本机提取单独声明无模型成本与权限。固定指令由插件 prompts.ts 登记，界面、MCP 与 Workflow 使用同一 Action 定义。

Shelf 和结果面板使用 Host 注入的 UI 生命周期。卸载释放全局事件、请求、观察器及计时器；隐藏停止运行进度查询，返回时保留编辑/确认/运行中的交互，其余状态读取最新快照。迟到的旧快照不能覆盖较新的读取或命令结果。

搜索打开材料或剪贴板 ID 时选择对应正文；剪贴板仍只对本人提供。权威快照刷新会让完整正文缓存失效，较早的文件回包不能覆盖新正文，比较视图采用同样规则。跨插件文件入库事件也随挂载释放，卸载后不再发请求或发布过期成功/失败通知。

这些客户端边界的回归在 `tests/shelf-client-boundaries.e2e.test.ts`，正式搜索与剪贴板隐私断言在 `tests/system-search-host.test.ts`；依次用 `node scripts/run-tests.mjs` 运行相应文件，浏览器批次需排时段。
