# 第 35 批合后复核修复

状态：修复已实现，隔离 Home 的目标路径已复验。基于已合入的 #2123 及独立复核提交 `38219496f49c90518d0d799b94ef898108914e56`。真实外部工具、真实模型和本人验收待执行。

范围依据：[第 35 批路线书](../post-anticorruption-roadmap/reference/batches/35.md)、[Onboarding](../onboarding-coverage/spec.md)、[Sessions](../sessions-rebuild/spec.md) SRB-09 及合同 §10.2、§12 第 16 项、Coding A1～A4、[决定 51](../post-anticorruption-roadmap/reference/decisions.md#decision-51)及已确认的方案 A。沿现有 Actions、Agent Host 和平台对话附件服务验证。CLS-02 联网下载留第 65 批第 2 项，K-4 留 Prologue 上游。A1 受审写入和第 31 批已有授权能力继续回归。

| 编号 | 验收 |
| --- | --- |
| B35-R1 | 已有项目有可见的接续入口。恢复以该项目为准，显式传入另一个项目的引导也不能带走上下文。新建项目及 OAuth 回跳正常。 |
| B35-R2 | 仅当本人已开启项目 AI 读取许可，才可通过 Sessions 的公开动作读原文并送模型。缓存原文可供本人回看。发送前和整理稿交给本人审阅前复核同一许可与作用域，撤权、撤权再授予与迟到结果均不能发布旧整理。读取中断保留已读材料，初始关许可或整理失败仍可继续其他来源。 |
| B35-R3 | 同项目重复导入同一来源版本并采用相同整理时，保留同一原文页、整理页和固定成果。新来源版本或用户改动后的整理可留独立结果。 |
| B35-R4 | Coding 只为真实图片入库。取消和授权失效不得留下正式附件。共享 blob 的遗忘、同哈希重添和存储失败不应留下坏引用或删去仍有主人的内容。 |
| B35-R5 | 助理发送文档后通过当前工作和平台附件服务重新读到原件。助理库 U1 2 → 3 将无法恢复的旧图片改为明确的过期状态，保留同期文字。项目清除按拥有的引用遗忘。 |
| B35-R6 | Coding 一次取一个回复的图片，图片随会话视图释放。沙箱同一次调用对同一附件的分段读取只装载一次，通过实时授权控制每段。 |
| B35-R7 | Coding 命令预览和实际发送逐字替换 `$ARGUMENTS`，包括参数首尾空白和多行。沿原命令发现、优先级和读取授权。 |
| B35-R8 | A4 仅接受当前文件版本的推送诊断或当前拉取结果。未检测时明确说明，找到工具与启动成功可区分，审查卡与允许后写盘的格式化字节一致。 |
| B35-R9 | 路线书、需求归属、合同及快照、Home 版本和验收记录反映本次范围。测试与门禁结果对应实际运行的修复树，注明真实模型与一骏本人验收。 |

验证优先使用仓库的 Node 24.15、受影响测试、隔离 Home、独立测试浏览器和金样升级链。新增针对性断言覆盖跨项目恢复、撤权与缓存、跨引导幂等、附件持久化及竞态、参数、诊断版本和启动失败。

## 复验依据

复核基线为 #2123 的合入提交 `38219496f49c90518d0d799b94ef898108914e56`。修复在 `codex/b35-audit-fixes` 独立工作树。Prologue SDK 用本批合入的 `0.0.0-rc.1`，来自 Prologue `64e5aaf444629aa597f028e63cf4090456830637`。复验使用 Node 24.15.0。

| 验收 | 路径与证据 |
| --- | --- |
| B35-R1、R2、R3 | 工作台「外部会话 → 开始整理」、新建项目、项目级 HTTP 引导。断言原文、时间、来源与实际采用位置，覆盖撤权再开、晚到答复、部分读取失败及跨引导去重。用例见 [浏览器入口](../../tests/context-onboarding-sessions.e2e.test.ts)、[新建项目](../../tests/context-onboarding-blank.e2e.test.ts)和 [宿主回归](../../tests/context-onboarding-sessions.test.ts)。 |
| B35-R4、R5、R6 | 助理的文档和图片随引用回读。验证真正重启后的原件字节、旧图片过期、删项目后共享附件保留及沙箱每轮一次读图。用例见 [附件权限](../../tests/security-invariants-conversation-attachments.test.ts)、[重启](../../tests/assistant-image-restart-http.test.ts)、[侧栏](../../tests/assistant-open-object.e2e.test.ts)、[删项目](../../tests/project-deletion-assistant.test.ts)和 [沙箱](../../tests/plugin-sandbox.test.ts)。 |
| Coding A1～A3、B35-R7 | 实际 `/init` 经审查写入。项目和个人命令的预览及模型输入逐字对照。实际粘贴、拖放、切换模型或只发文字，核对 Agent Host 请求及回读的两张图。见 [命令](../../tests/coding-commands.e2e.test.ts)、[图片](../../tests/coding-images.e2e.test.ts)、[重启](../../tests/coding-images-http.test.ts)。 |
| Coding A4、B35-R8 | 实装 TypeScript Language Server 5.1.3 与 TypeScript 5.9.3。在宿主上通过新旧文本对比查到 TS2322，格式化成功，下一次干净改动显示通过。缺工具、启动失败、迟到旧诊断和审查卡最终写盘由 [工具识别](../../tests/code-intelligence-readiness.test.ts)、[诊断](../../tests/code-intelligence-write-check.test.ts)和 [文件审查](../../tests/coding-review-card.test.ts)覆盖。 |

Sessions 继续保管许可、会话来源和历史。引导通过公开动作读与复核，分项目暂存原文。本人采用后，Pages 和成果库持有固定版本，Todo 保存选中的待办。模型请求由 Agent Host 发送。对话附件库持有文件字节和提取文字，Coding 与助理保存引用，按各自安装、项目或当前工作读取。

本地构建、包边界、健康门禁、API／动作／库结构合同及 67 项页面资源比较通过。24 个宿主测试文件通过 344 例，跳过一例异平台沙箱用例。6 个独立浏览器测试文件通过 23 例。隔离 Home 使用测试会话与回环模型服务验证输入、发出请求及持久化结果。修复提交的远端 CI、Full、真实外部历史与模型效果及一骏本人验收仍待执行。
