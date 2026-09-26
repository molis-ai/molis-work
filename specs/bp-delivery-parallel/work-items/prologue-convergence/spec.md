# 统一现有 AI 能力至 Prologue

2026-09-26，用户明确「AI 能力都使用 Prologue」。目标为现有生产 AI 路径完整迁移且保持原产品行为，达到内部完整，不只约束新增功能。

## 已核实证据

`apps/local-host/src/host-complete-text.ts` 的 `completeTextRequest` 直接 fetch 文字模型；`assistant-http.ts` 等生产入口使用它。`plugins/native/images/src/providers.ts` 的 `generateProviderImages` 直接请求 OpenAI Images/Gemini。原审查任务报告 Form、Dataset、Pages、灵光、Jelly、Workflow 等消费前者，需逐一核对当前装配；Cognia/Onboarding/Alchemist/Coding/Builder 有 Prologue 基础，需复用。

## 行为与范围

- 列出所有现有生产推理/生成路径与实际调用链，区分第三方资料/业务 API 与模型推理。所有 AI 经真实 Prologue 执行端口，Provider 网络访问留在 Prologue 所属能力中。
- 迁移通用文字生成与图片生成，再核对其他入口是否仍绕过。不能只在旧直连外包一个名叫 Prologue 的函数，也不能用 Agent 工具调用旧直连来伪装迁移。
- 保持当前显式模型选择、凭据引用、撤权/配置变化处理、取消/超时、材料保留、错误展示及输出保存。图片 MIME、大小、远程结果下载等既有有效边界不得回退。
- 凭据、模型设置及 Character 不复制；不造第二份 Agent Host/Session/工具目录。若当前 SDK 缺图片等所需能力，列出具体必要补充，与原 Agent Host owner 串行交接；继续完成独立部分，禁止静默退回直连。
- 不重做插件 UI、动作体系、模型设置产品、Connector 业务读取或新助理；只做达成本项要求必要的调用路径迁移。

## 并行边界

独立工作树、原 checkout 只读。原动作任务 `01a0d468-fe5c-7410-8ae8-63a608d76f6d` 已在2026-09-26明确移交整条共享推理实现给本任务：除文字/图片/TypeSafe调用端，还包括inference类型/适配/resolver、既有Runtime装配返回/close、composition inference代理、system-agent-service凭据绑定，以及SDK image/TypeSafe/本地调度必要扩展。先接收并保留主树F1/F3的actor/owner/budget/trusted caller/lazy-init修复，再实现可运行整体；不能用旧工作树覆盖这些修复或单独合入不能编译的调用端。

原动作owner仍拥有Action权限、Character、Workflow及业务接入；project-host生命周期必要最小diff由本任务提交给它串行落地。涉及同一源文件时，移交窗口只由本任务落笔，原owner的必要改动以最小diff交接，不能按代码片段默契并写。允许Home到既有inference端口引用的bind/unbind查询，禁止新Runtime。SDK/锁依赖与原owner及Builder当前依赖窗口串行交接。

depends_on：现有 Prologue/Agent Host 与当前模型配置/Secret 协议；新增助理消费迁移后的共用接口，不等待它实现。

## 验收

真实 Prologue 执行证据覆盖文字和图片：生产装配确实进入 Prologue，返回内容能进入原业务持久化和后续编辑。注入测试验证取消、权限/配置变化、无模型、错误响应、低质量/空输出、失败材料保留和重试；不得只查字符串/导入名称判断迁移成功。

核对消费者、跑受影响包 build/typecheck 和有效回归，使用隔离数据及已配置服务做真实模型实操；缺可用图片服务时准确记录未验证项并继续其他路径。保留已有正确能力，不以关闭功能或模型直连兜底换取测试通过。精确命令和验证结果由实施任务补充。
