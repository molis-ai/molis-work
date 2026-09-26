# 验证记录 · 2026-09-26

目标等级：内部完整。当前证据：专属模块工程与隔离实操通过，生产共享接线及联合验收未完成。用户本人尚未验收。

## 工程

`node scripts/run-tests.mjs tests/personal-assistant.test.ts tests/personal-assistant-prologue.test.ts tests/personal-assistant-sources.test.ts`

最终合并运行 15/15 通过，0 失败、取消或跳过，总计约 5.2 秒。覆盖双源/项目引用→确认原动作→真实 SQLite 可编辑草稿；磁盘重启保持忽略/偏好；稍后恢复；偏好乐观锁；并发确认一次；写成但响应丢失时读原成果，不重放；来源撤权、材料变化、角色冻结、无工具 Prologue SDK；低质量引用/无关/失败退回人工；模型期间撤权；实际分派期间撤权与偏好改变；历史与mutation回执脱敏；原成果读取撤权；无关事件不重新提示已忽略证据；no-op检查避免重复模型调用；现有Home事件消费/原方法reader及方法停用；Inbox→Feed来源授权与真实时间组合。

`pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --noUnusedLocals --noUnusedParameters apps/local-host/src/personal-assistant*.ts apps/workbench/src/personal-assistant-ui.ts tests/personal-assistant*.ts scripts/personal-assistant*.mts`

通过。全包构建初次被继承快照的 `packages/design-system/src/plugin-components.ts:133` unknown payload、Coding routes 隐式 any 阻断，随后产生缺 dist 的级联错误；本任务未修改或放宽这些共享检查。原 owner 已在原 checkout 修复，待共享集成。SDK 测试初版曾写错 semver，修为 1.0.0；并行机器负载下 30 秒测试期限曾取消一次，调为 120 秒后隔离 runner 实测数秒完成；生产模型超时仍为 120 秒。

## 真实模型

`MOLIS_ASSISTANT_LIVE_TEST=1 node --import tsx scripts/personal-assistant-live-model.mts`

使用现有 Minimax / MiniMax-M3 配置与原凭据 resolver，经原 AgentHost + Prologue SDK，执行目录/存储为隔离验证目录。没有生产私有资料，也没有新运行时实现。`evidence/live-model.json` 为含糊新增要求返回 no-op；`evidence/live-model-positive.json` 为明确批准冲突返回跨材料建议与逐字引用。均未执行任何业务写入。这是合成内容的真实模型验证，不是私人 Connector 或最终 Pages 路径验收。

## 真实公开来源

`MOLIS_ASSISTANT_PUBLIC_SOURCES=1 MOLIS_BUILT_HOST_ROOT=/Users/yijunwang/code/goalboard node --import tsx scripts/personal-assistant-public-sources.mts`

Node.js / TypeScript 两个公开 releases Atom 源均经现有 FeedSourceService / RSS runtime / 原 Feed 存储同步成功，各导入 10 条；原 feed.subject.read 返回对应标题、版本与正文。`evidence/public-sources.json` 保存路径、来源与原记录证据。所有项目/连接写入临时目录并清理，无私人账号。原 checkout 的已构建 Host 仅只读加载，不能据此宣称本工作树全包构建通过。发布时间与观察时间分别保留，旧发布不会被描述成今天新发生。

## 浏览器与设计

`pnpm exec tsx scripts/personal-assistant-preview.mts` 提供隔离可交互预览：固定模型、示例RSS/视频、真实SQLite/ActionService。Cua 实操：三处原文展开；偏好填写保存；确认动作后出现完成记录；调整要求生成新建议但不执行；忽略后重载不再弹出。桌面1280与窄屏390截图 `evidence/desktop-final.png`、`evidence/mobile-final.png` 已实际查看。

Impeccable detector 对 UI 文件返回 `[]`。只读视觉 reviewer 首轮指出角色身份位于标题上方、窄屏summary触控行偏薄；已移动角色到正文后并扩至44px，最终两项均 resolved。该裁决仅覆盖两项截图/源码，不扩大为生产界面或其他状态验收。

只读功能 reviewer发现的历史泄漏、材料变化阻断恢复、分派时撤权未重验均已修；后续mutation回执泄漏亦修为只返回状态，并有业务回归。

验证脚本末次只读审查未发现生产业务写入、私人来源读取或已保存 evidence 含秘密。指出初始化/关闭异常可能跳过临时资源清理，已用嵌套 finally 保证环境恢复和目录清理；未因此重复消耗真实模型或取数调用。

## 未运行 / 未完成

生产 Home 整合、真实来源与真实模型及实际 Pages 编辑器连续链路、已有 Character 在正式界面的选择/管理、无代码工作区用户在正式 Home 的完整路径、三次同类工作复用收益、用户本人验收。详见 handoff.md 的具体 owner 接线，不以这些独立证据替代最终内部完整。

## 5a5d23eb 后的限定 P1 修复

原 15 项并未覆盖 recover 的缓存建议标题和真实模型分派前的撤权交错。新增恢复回归以只存在于建议标题的私密标记验证：撤销材料读取、保留原成果 read 权限后，成果仍能恢复，成功与 owner 返回 null 的响应均不含该标记，写次数始终为 1。相关业务与来源测试 15/15 通过。

模型回归使用实际 AgentHost + Prologue SDK、隔离 session/storage 和模拟 provider transport，分别在 `prepare`、Node `resolveCredential`、原 `authority.beforeDispatch` 设置异步屏障。前两处覆盖来源撤权、材料变更、偏好暂停及动态模型权限撤销；最后一处验证最终 SDK guard 保留且等待后复验。动态权限用例保持原 `caller.permissions` 快照不变，通过 `validate_permissions` 回调拒绝，不能以修改只读权限数组代替真实 owner 撤权。

旧 Node 的验证结果：prepare 四个交错已通过；credential 期间的来源/材料/偏好撤销仍各发出一次模型 transport 调用，测试稳定失败，证明仅早期检查不够。只读 reviewer 的服务级动态撤权复现由 `dispatched=1` 改为 `dispatched=0`、`permissionChecks=2`，静态 model 权限仍保留。原 beforeStart 拒绝测试、严格 TS 已通过。最终 SDK fetch 前检查必须与共享 owner 新版 Host/Node/SDK 一起使用，不能单独以专属补丁关闭 P1②。

联验命令：`MOLIS_ASSISTANT_AGENT_HOST_ROOT=<共享 owner 工作树> node scripts/run-tests.mjs tests/personal-assistant.test.ts tests/personal-assistant-prologue.test.ts tests/personal-assistant-sources.test.ts`。变量只决定只读加载 `horizontal/agent-host/dist/index.js`，不复制或修改共享源码；正式整合后去掉变量使用本仓正常依赖。

随后按共享 Host 新合同补充无工作区必要增量：角色声明 workspace:none；测试与 opt-in 脚本通过 Host 可信 createSession 入口创建无目录会话，scope 保留 AgentWorkspace 判别。正向 SDK 测试同时检查 Session、start request、frozen 均为 none，directory 始终 undefined。无工作区 SDK 路径的验证见下一段；旧带目录的真实 MiniMax 证据仍不能当作无目录真实厂商调用证据。

最终联合运行已通过：`MOLIS_ASSISTANT_AGENT_HOST_ROOT=/Users/yijunwang/.codex/worktrees/2f9d/goalboard node scripts/run-tests.mjs tests/personal-assistant.test.ts tests/personal-assistant-prologue.test.ts tests/personal-assistant-sources.test.ts`。使用收敛 owner 明确交付的新版 dist，只读加载，不复制或改写共享源码。结果 27/27，通过，0 失败/取消/跳过，约 5.76 秒。9 个交错分别是 prepare 的 source/material/preferences/动态 model 权限、credential 的同四项、最终 SDK dispatch 中原 owner guard 等待后撤 source；每项均断言 fetch=0、建议数=0、writes=0。正向无工作区 SDK 路径保留 Character/材料/无工具限制，确认原 Action 后只产生一次 SQLite 草稿；原 beforeStart 拒绝仍生效。SDK 实际运行，provider transport 使用模拟 SSE，不把此证据称为真实厂商模型调用。

同一新版类型合同的严格 TS 也通过：沿用本文工程段的 noEmit/ES2022/NodeNext/strict/noUnused 选项和全部专属源文件、测试、脚本，将 `@molis-ai/molis-work-service-agent-host` 映射至共享树 `horizontal/agent-host/dist/index.d.ts`，contracts 子路径映射至共享树 `packages/contracts/dist/*.d.ts`。配置写在临时目录后清理，未改本树依赖或共享文件。主树须整合同一套 Host/Node/SDK 后使用正常依赖重验；本树继承的旧运行时不能提供此能力。

结论：两项限定 P1 在上述专属模块与共享新构建组合中已获得关闭证据；尚不代表生产 Home/Pages 联合路径完成或达到内部完整。

本次执行工具返回的原始测试输出已原样保存到 `evidence/sdk-integration-output.txt`，包含该次 SQLite 警告、每项结果和 27/27 统计；没有为了保存日志重复运行。严格 TS 执行返回 exit 0，stdout/stderr 为空。

存储边界增量只将 node:sqlite 的 type-only import 替换为公开 storage factory 的 ReturnType；SqliteDatabase 实际是另一种 better-sqlite3 类型，因此未强行转换。Store/Service/Host 和业务来源测试的定向严格 TS 通过。运行本树边界检查前补构建已有 test-kit 包，检查不再报告 personal-assistant；仍有继承快照的 inventory、Connector、Goal 10 项错误，未扩大修改范围。该结果只关闭助理新增边界错误，不代表全仓边界检查通过。

## 主目录集成检查 · 2026-09-26

统筹从 `c890c244` 精确导入24个新路径并追加既有子spec，没有改共享入口、导出或dist。与主目录新无工作区合同整合时，将 `StartScope` 改为身份字段加原 `AgentWorkspace` 判别联合类型，完整透传 workspace/directory 两分支；没有类型断言或伪造目录。上述专属严格TS命令在主目录通过。

`node --import tsx --test tests/personal-assistant.test.ts tests/personal-assistant-sources.test.ts` 在主目录15/15通过，0失败/跳过，总计约11.9秒。此次未重复真实模型调用，也未运行已知依赖旧SDK会失败的最终分派组；这组保持必要待验项，待共享owner新构建后由助理owner完整联验。生产入口尚未启用，内部完整结论仍不成立。

后续精确接入 `39a6e594` 的Store两行类型修正：经原storage factory返回类型引用实际数据库接口，消除app直接依赖驱动类型。主目录严格TS通过；完整边界脚本不再报告assistant项，剩余为另一个owner的sandbox两项元数据问题。没有新增豁免或运行时行为变更。

主目录已随后合并42223829/08c66209的7路径（角色none、可信session脚本/测试、文档和原始输出），完整保留本节既有记录及Store/AgentWorkspace类型。统筹已核对测试正文中的9项零请求/无写入断言及原始27项通过输出；不重复同一跨树测试。主目录配套Host/Node/vendor由原owner同时合流并统一构建，完成后才使用正常依赖做主目录最终联验。未将跨树严格TS结果冒称当前主目录新版类型已验。

### 主目录正常依赖 SDK 联验

统一Host/Node/vendor合流后，动作owner使用主目录正常依赖执行完整助理27项与Character真实SDK2项，共29/29通过，0失败/取消/跳过，4.59秒；原始日志 `/tmp/action-shared-main-assistant-character.log`。统筹已读取每项结果并核对主目录AgentHost dist公开beforeDispatch/createSession新声明，未重复运行同组。此前跨树alias限制已由这次主目录结果解除，两限定P1在当前配套构建中关闭；生产Home→Pages连续实操仍未完成。

统筹随后在主目录直接运行本文专属严格TS命令（无路径映射、使用正常依赖），exit0。没有重新消耗模型调用或扩大测试范围。
