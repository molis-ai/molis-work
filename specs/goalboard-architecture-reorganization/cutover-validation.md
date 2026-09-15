# 最终切换验证记录

范围与顺序沿用总 spec §24、cutover-work-plan.md。现有产品迁移、统一真实用户验收、问题清理和受影响链路复验已完成；初始要求逐项结论见 [最终架构审计](final-architecture-audit.md)。本报告区分人工操作、自动集成和未来未实现范围。

## 自动回归基线（2026-09-08）

- `NODE_NO_WARNINGS=1 pnpm test`：完整48包/root/PTY构建通过。752项实际测试，751通过、1失败、0跳过（218.5秒）。失败仅为visual-foundation桌面树搜索仍断言display:none；`git show HEAD:packages/design-system/src/styles/personal-workbench-v3.ts`确认迁移前已是display:flex，与实际搜索行为一致。修正旧断言，生产样式未变，随后复验记录如下。
- `pnpm workspace:typecheck`、`node scripts/check-package-boundaries.mjs`通过：719源码、2784imports、101依赖边、0兼容豁免、0错误。
- `node --test --test-concurrency=1 packages/test-kit/tests/*.test.mjs tests/*.test.mjs`：23通过、0失败、0跳过，包含边界反例；不删除或放宽SQL/实现依赖禁区。
- 日志：`/private/tmp/molis-work-cutover-{full-regression,final-static,search-regression}.log`。全量测试中真实Chrome已运行，无浏览器缺失跳过；HTTP/协议fixture与人工UI操作证据仍分别记录。

## 干净npm消费（2026-09-08）

使用正式`apps/local-host/tooling/pack-npm.mjs`生成tgz，安装到全新`/private/tmp/molis-work-cutover-consumer-20260908`，没有仓库symlink或NODE_PATH。离线首次缺少@xterm/addon-fit缓存而停止，随后正常npm install同一tgz成功，63 packages；不修改仓库依赖/锁。

`NODE_NO_WARNINGS=1 node tests/npm-distribution-smoke.mjs /private/tmp/molis-work-cutover-consumer-20260908`通过：原生SQLite持久化、真实PTY输出、规划静态资源、默认源Home安装与重复安装、升级不改项目数据、失败回滚、版本恢复、源目录移走后的MCP启动、卸载预览及确认。测试Home由脚本清理，临时consumer与tgz保留供用户旅程验收；未升级现用Home或发布npm。

日志：`/private/tmp/molis-work-cutover-{npm-pack,consumer-install,consumer-install-online,consumer-smoke}.log`；发布候选tgz：`/private/tmp/molis-work-cutover-npm-20260908/adeptify-molis-work-0.1.14.tgz`。

## 统一用户旅程与清理

已完成：发布包独立 Web、实际 Native App、CLI/MCP 同项目对账及安装恢复。以下先保留首次试验记录，再记录修复和最终复验。


### 实际用户 Goal 闭环（2026-09-08）

真实发布包安装在独立临时Home；Web4197，IAB实际点击。首次引导创建项目「发布验收 · 周末阅读」、工作目录及Draft → 页面补全Contract与一个文件完成条件 → MCP提交同一Draft确认提案 → 页面空理由拒绝后填写理由并采用 → 正式CLI领取executor，完全相同请求重放返回同一Claim/Run → 实际写入三条示例阅读清单 → MCP提交完成Run → 页面快速记录保存inspection依据 → MCP按self_verifier领取 → 重启Web并用新MCP连接读回 → 重新读取文件后提交Review通过 → UI刷新显示已完成与无未完成检查。后端Goal satisfied、无active Claim/Run、Review通过、Evidence同一个ID。

依据的project://地址在Web入口没有工作目录上下文时明确显示UNVERIFIED，保存不等于验证文件；实际Review另行读取临时工作目录文件。新建Session对话框取消，列表数量保持1；该Session由测试MCP活动登记，测试Runtime ID无原生对话文件时页面明确显示读取失败，并保留Molis Work活动事件。

复现材料：`/private/tmp/molis-work-cutover-user-state.json`、`molis-work-cutover-ui-{cli-select,mcp-approved,after-evidence,review-current,review-claim,restarted,review-complete}.json`及`molis-work-cutover-mcp-client.py`（完整路径前缀均为/private/tmp/）。人工试验起初漏填self_verifier角色，被实际门禁拒绝且没有领取；按返回角色明确填写后成功，未修改产品语义。

### 首次用户试验发现的问题（以下四项现已修复）

1. **最近执行记录错误**：三次Run/Claim在实际数据库中完整存在，记录页却显示最早的clarifier。Execution listRuns/listClaims按时间降序；Workbench renderRunCell/renderClaimCell及进展面板用at(-1)，错误取末项。应按明确时间选择最近记录，覆盖多次执行与历史阻塞，不改变后端状态规则。
2. **Web --home与Feed凭据目录不一致**：服务指定临时--home，但Storage resolveMolisWorkHome仅消费MOLIS_WORK_HOME或用户默认Home。首次来源页面因此读取已有本机授权，手动GitHub同步仅GET拉取50条通知到临时测试库；未读取正文、发送消息或修改远端状态，未断开/删除真实凭据。已停止原临时服务，显式MOLIS_WORK_HOME=测试Home、MOLIS_WORK_SECRET_BACKEND=file并清除继承的两种连接令牌后重启。需统一Host安全上下文，不能把测试脚本补环境当产品修复；检查同进程多Home/既有服务契约后选择最小完整方案。
3. **来源操作丢失当前页面**：从Goal打开来源，立即拉取完成后的reload回到Goal记录页；必须重新打开来源才能看到结果。修复后在同一来源保留结果与运行记录，并复验错误/重试。
4. Goal快速记录加号无可访问名称（实际AX只有button）；修复按钮标签。未发现Evidence状态丢失或完成规则失效。

首次基线的旧样式断言修复后，29 项 visual-foundation 与真实 Chrome Goal Tree 回归通过。最终清理结果见下文。


## 清理后的最终回归

四个实际问题的根因与修复：

- 最近 Run/Claim：Native Goals UI 按 started_at/claimed_at 与 ID 选择最新记录，活动 Claim 优先；进展面板共用该选择。实际三次执行后的页面显示 self_verifier，而非旧 clarifier。8 项跨入口/记录回归通过。
- 显式 Home：Storage 使用异步请求作用域，Host 在 HTTP 和后台调度中注入实例 Home；SecretStore 保留构造时 Home。没有全局修改进程环境。两个真实 HTTP Home 的并发绑定、凭据回读、默认目录不受影响和内容 key 隔离测试通过（与 Feed security 共 7 项）。
- 页面恢复：reload/back_forward 恢复当前 Sources/Feed，新的 Goal 导航仍打开指定 Goal；Decision 刷新只在匹配视图处理 hash。3 项实际 Chrome 导航回归通过，重新安装后的人工来源/Feed 页面保持正确位置。
- 快速记录按钮补可访问名称；实际 AX 可见“快速记录”。

`NODE_NO_WARNINGS=1 pnpm test` 在最终生产代码上完成全部构建及 755 项测试：754 通过、1 失败、0 跳过。唯一失败为 desktop-tui 的旧源码字面断言仍要求旧 if 条件；按新导航规则更新断言后，该项定向复验通过。此后未改生产行为；这是“完整运行 + 失败项修正复验”的组合证据，不声称另一次 755/755 全量运行。日志 `molis-work-cutover-cleanup-full-regression.log` 与 `molis-work-cutover-desktop-navigation-assertion.log`。

最终 `pnpm workspace:typecheck`、`node scripts/check-package-boundaries.mjs` 通过，0 compatibility allowlist、0 旧 Huge 清单项、0 边界错误；23 项静态边界/反例测试通过，0 跳过。日志 `molis-work-cutover-cleanup-static.log`、`molis-work-cutover-cleanup-boundary-tests.log`。日志路径前缀均为 `/private/tmp/`。

## 最终安装包和真实入口

- 新 npm 包安装至全新 consumer 后，`tests/npm-distribution-smoke.mjs` 再次通过原生 SQLite、真实 PTY、规划资源、首次安装/重复安装、升级、失败回滚、版本恢复、源目录移走后 MCP、卸载预览及确认。包位于 `/private/tmp/molis-work-cutover-cleanup-npm-20260908/adeptify-molis-work-0.1.14.tgz`。
- 使用该包刷新隔离 Home，同一 Goal/Review/Evidence 继续显示完成。实际 CLI/MCP 领取重放、完成与自审链路见上述记录；没有模拟网页来代替正式后端。
- `env -u APPLE_SIGNING_IDENTITY pnpm desktop:build:macos` 通过，产出 `release/macos/Molis Work-0.1.14-macos-arm64.dmg`、App、zip，ad-hoc 签名。DMG 只读挂载并安装至临时 Apps 目录，启动实际 Native App。未运行公证或公开发布。
- Native App：临时项目 → 已完成 Goal → Sessions 回读真实终端输出与退出码 0 → Handoff 查看真实 Contract 后取消（无 destination session）→ Artifacts 缺失 consumer 时显示原始 JSON。Artifact 记录明确为 synthetic QA；真实外部 Plugin 的 scaffold/安装/授权/私有存储/Artifact/UI 路径另由 `tests/plugin-sample.e2e.test.ts` 验证，不能把 QA 记录说成真实 Provider 输出。
- Session：UI 新建 Session 的确认/取消，以及自定义无模型终端进程实测；输入 `cutover-terminal-roundtrip` 得到实际进程回显，输入 exit 后持久化 `source=goalboard_tui`、`metadata.exit_code=0`。Web 重启后 Native Session 页面读回同样输出。最终 registry 为 3 条 Session；Handoff 没有 destination。
- RSS：UI 注册 OpenAI Blog，真实 HTTPS 拉取 20 项；来源 → 来源消息 → 在 Feed 中查看，仅显示该 RSS 20 项。首项人工加入 Inbox 后，公共 Query 为同一 Item 的 manual/open 引用。最终新包重启后，UI 的“查看保存的正文”仍展开持久化文本。390px 窄屏实看 Feed 详情：使用顶部分栏、正文正常换行，可滚动；恢复原视口。未把窄屏截图当完整可访问性审计。
- Settings、Project 隔离/迁移、空态、拒绝/取消、重复提交与安装恢复由统一人工旅程和全量中的真实 HTTP/Chrome/进程回归共同覆盖。Gmail/GitHub 真实 OAuth 授权未重做；协议失败、重试和隔离由 provider fixture/HTTP 回归验证。

收据：`molis-work-cutover-cleanup-{session-receipt,session-final,rss-receipt,artifact-receipt}.json`。原生服务恢复记录：`molis-work-cutover-native-final-P59OFZ/events.jsonl`（均位于 `/private/tmp/`）。

## 测试环境清理与完成边界

Native 验收按既有授权短暂停止原 4173 服务，退出测试 App 后已恢复原服务；guard 记录原配置字节未变、owned running、14 个原项目。未将新包安装至现用 Home。

第一次来源试验受 Home 缺陷影响，GET 拉入 50 条已有 GitHub 通知至测试数据库，没有发送、写回远端或删除真实凭据。该问题已修复；2026-09-08 最终核实测试 PID 64697 只监听 4197 后正常终止，并删除整个隔离测试 Home，包括通知副本和测试 SecretStore。清理收据 `molis-work-cutover-cleanup-complete.json`。不保留通知备份。

完成等级：现有功能的内部完整与本地可安装发布候选。Outbox、Team/Server/Exchange 等已明确后置能力不算实现；公开 npm 发布、现用安装升级与 Apple 公证不在此次动作范围。代码保留在当前工作区，未 commit/push。

SDK 边界补充：根 index 仍导出 MolisWorkCoordinator 的新 owner 别名，sdk-store 保留旧只读方法；这是 0.1.x 已发布 API 的有界兼容，不是旧跨领域类实现。精确边界见最终审计，不能把“旧实现退出”误读为“旧符号全部删除”。
