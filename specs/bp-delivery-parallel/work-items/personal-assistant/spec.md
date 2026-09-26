# 启发式个人工作助理

2026-09-26，用户授权实施。总约定：`../../spec.md`。目标：内部完整；所有 AI 经 Prologue，执行复用共享 Action，角色沿用 Character。

## 要交付的结果

结合用户授权的 Connector 内容、当前项目目标/进展及已有成果，发现值得处理的变化，给出带来源和原因的建议；用户能够采纳、修改、稍后处理、忽略或关闭一类建议，确认后实际执行并保存成果。重启、超时或数据失效后可继续，不重复打扰和重复产生副作用。

首条真实路径：已有工作材料与新到的相关信息存在需求变更或待办差异，助理关联原任务/成果，解释建议和证据，用户确认后通过现有动作生成可编辑修改稿并回到项目。先采用实际已接通的至少两个信息来源，不为凑来源引入未授权账号；模型实测用无隐私材料或获得授权的资料。

## 范围与边界

- 工作上下文聚合、按事件或合理计划重新判断、建议生命周期、去重/过期/稍后提醒、用户可控制的打扰策略。
- 可审阅的用户偏好与工作方式；临时决定和长期规则区分；用户可查看、修改、停用。统一助理身份贯穿界面与 Character，但不重写 Character/Prologue 核心。
- 使用现有 Connector 公开能力、Home 建议与动作能力。当前 `home-actions.ts`/`home-offer-actions.ts` 已提供判断和执行，不另建执行注册表。
- 与成果复用任务协商候选接口；历史成果及已确认方法由原存储/复用模块持有。助理负责何时提出建议及如何表达，不复制方法库。
- 不重做 Connector OAuth、Builder、团队服务、全局导航或后台执行权限系统；能力未提供时清楚说明缺失，并向原 owner 提出具体接入变更。

## 并行与文件

depends_on：已有 Connector、Action、Prologue/Agent Host；成果复用接口是可渐进接入依赖。可立即完成现有材料的建议链路。独立工作树内先确定专属模块及测试路径，写回本文；共享 Action 核心、Agent Host、Home 共用入口及导航先向 owner 提交最小接线需求，不在原 checkout 同写。只修改本任务与配套文档。

## 验收

先实现可交互切片，再验证真实建议→确认→动作→可编辑成果→反馈的完整路径；错误来源、过期材料、无关信息不制造肯定建议；重复事件不重复打扰；忽略一次不形成永久规则；重启保留选择；权限变化阻止越权；低质量/超时允许人工继续。验证实际 Prologue 调用及使用的上下文，固定模型只支持局部工程结论。

先检查项目现有脚本，使用相关包 build/typecheck、必要业务与集成测试、隔离 Home 浏览器实操；将精确命令、结果、截图及真实模型证据写入本任务验证记录。缺私有账号不阻止无隐私真实模型验证或其他独立工作。

## 实施合同（本工作树）

分支 `feature/personal-work-assistant`；起点 `0387c9b8`，带现有未提交动作迁移快照。只写 `apps/local-host/src/personal-assistant*.ts`、`apps/workbench/src/personal-assistant*.ts`、`tests/personal-assistant*.ts`、`scripts/personal-assistant*.mts` 与本子目录。原 checkout 只读；共享入口由 owner 接入。

实现采用专属业务服务和注入的 SQLite 数据库。只保存显式建议、反馈、偏好及原请求状态；不建立模型记忆。授权上下文通过 `resolveActionSubject`，动作来自 `home.actions.prepare`，确认调用 `home.actions.execute` 原始 offer。模型只选择真实候选和原文引用，不能生成执行参数。新信息和项目材料必须各有可验证引用；截断、来源失效或证据不足进入人工检查。使用共享 Agent Host 的 Prologue 只读角色，固定 Character Artifact 引用，不创建运行时。

临时忽略仅抑制当前材料版本；长期分类关闭由明确偏好操作产生，可修改和停用。静默时段、暂停与展示上限只决定打扰，不授予读取/执行权限。重复事件按当前来源和材料版本合并；稍后、结果及偏好重启保留。执行前重新验证上下文和权限，SQLite 原子领取防止并发重复。执行失联保留原请求并进入待核对，禁止自动重放业务副作用；原 owner 的结果查询可恢复成果。

界面是现有首页的可嵌入助理面板：一条当前建议、可展开的来源与逐字依据、确认/调整/稍后/忽略、偏好抽屉，保留编辑成果链接。先用标明示例的隔离可交互切片，再接业务服务；不修改全局导航或视觉系统。

验证：`node scripts/run-tests.mjs tests/personal-assistant.test.ts tests/personal-assistant-prologue.test.ts tests/personal-assistant-sources.test.ts`；专属模块严格 typecheck；隔离 SQLite + ActionService + 原 Home prepare/execute 动作链路；Prologue SDK 工程测试与无隐私真实模型分开；桌面/窄屏浏览器实操。共享运行时、首页路由及 Connector 接入由原 owner 串行处理，未接入时明确记录，不以模块单测声称内部完整。

## 视觉与交接合同

Operate 模式，局部扩展现有 Home，不替换布局和全局样式。中性纸面、紧凑 13px 正文、单条建议优先；依据按来源逐条展开，确认动作在原文依据之后；低打扰控制与处理记录放在次级区域。用户调整要求会重新判断，不直接改写原 owner 的动作参数。偏好用内嵌表单，避免无必要模态中断。截图证据在本目录 `evidence/desktop.png`、`evidence/mobile.png`；这是隔离示例内容的真实服务交互，尚非最终 Home 整合验收。

## 限定 P1 修复 · 2026-09-26

统筹复现两个原验证遗漏：执行后来源撤权，recover 仍返回来源派生的缓存建议标题；Prologue prepare/模型准备期间撤权，事后拒收无法阻止正文已经发出。本次仅改专属模块与配套测试。恢复响应只使用原成果 owner 当前授权查询返回的标题；无成果时使用通用状态，不返回缓存建议标题，仍不得重放写动作。分析端口新增不序列化的分派授权回调，复验当前材料、来源、调用权限及偏好版本；Prologue 分别组合并保留原 authority.beforeStart / beforeDispatch，在 prepare 后检查，持续授权通过 beforeDispatch 传入共享 Host/Node 的真正网络分派边界，不把短命 start invocation guard 复用为后续模型分派授权。

回归通过唯一缓存标题标记核对撤权后的成功恢复与未知成果分支，保留成果独立 read 授权。实际 AgentHost + Prologue SDK 测试用异步屏障分别卡住 prepare 和 Node 凭据准备，撤权后释放，断言真实模型 fetch 数为零；同时覆盖偏好/材料变更与原 beforeStart 拒绝。共享 Host/Node 合同由原 owner 写入，本任务只读加载其构建产物联验，不伪造工作区或修改共享适配器。原 15 项通过不能关闭本次两个 P1。

共享 owner 随后交付正式无工作区合同：仅 Host 确认的 `workspace: "none"` 纯推理角色可省略 directory，Session 的 workspace 模式不可变。助理显式声明此模式，准备端口保留判别类型且不得传 directory；验证与 opt-in 实测通过 `host.createSession(..., {workspace:"none", role_id:"personal-assistant"}, authority)` 创建会话，`authorizedDirectories` 为空。模型 SDK 存储目录仅保存运行记录，不授予它作为用户代码工作区；此增量不改共享角色校验或增加 fallback。
