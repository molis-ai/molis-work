# 个人助理：集成交接

工作树 `/Users/yijunwang/.codex/worktrees/d62d/goalboard`，分支 `feature/personal-work-assistant`。本任务只修改 personal-assistant 专属文件、测试、脚本及本子需求目录。基础是含大量既有未提交动作迁移的 `0387c9b8` 快照；不得全量提交或复制工作树。原 checkout 仅作只读代码/已构建运行库对照。

## 已实现

- 多个新来源、当前项目材料与原 owner 方法 subject 聚合；通过现有 `resolveActionSubject` 读取原事实。
- 共享 Home events 消费、明确指令重新判断、跨来源引用校验、Prologue 只读分析、固定 Character Artifact 引用。
- 所有动作先通过 `home.actions.prepare` 获得完整输入。模型只选真实 offer，用户确认后调用 `home.actions.execute`，不能自行发明参数或拥有副作用。
- SQLite 持久建议/偏好/检查记录，临时忽略与长期分类控制分开。稍后、暂停、安静到某时刻、展示上限、用户工作方式可修改。相同检查不反复调用；无关新事件不能重新弹出同一已忽略证据。
- 原子领取确认，实际分派前重验全部来源/材料/偏好；未知结果持久待核对且不自动重放。成果通过原 owner 当前 read 权限恢复；历史与写回执不会带回撤权正文或缓存成果。
- 首页可嵌入面板，依据、确认、调整、稍后、忽略、偏好、历史、失败和恢复；桌面与 390px 浏览器实操，视觉审查所列两处已解决。

## 最小宿主接线（动作 owner 串行处理）

1. `openPersonalAssistant({homeDirectory,projectId,actorId,ports})`（`apps/local-host/src/personal-assistant-host.ts`）返回 `{service,close}`。使用既有 `openHomeSqliteDatabase`，存储名为 `personal-assistant`；增加此名到宿主 purge 列表。Host 负责生命周期，不能每次请求新建模型 Runtime。
2. `ports.actions` 为现有 live caller ActionClient，`home_provider_id` 为原 Home provider；`analysis` 使用 `createPersonalAssistantPrologue({host,prepare})`。`prepare(caller)` 供应真实已授权 session/authority，scope 保留 `AgentWorkspace` 判别类型。`PERSONAL_ASSISTANT_AGENT` 明确声明 `workspace:"none"`；通过 `host.createSession("prologue", {...owner, workspace:"none", role_id:"personal-assistant", title}, authority)` 创建此模式的会话，scope 同样传 `workspace:"none"` 且不传 directory，`authorizedDirectories:[]`。不能绕过 Host 角色检查调用 adapter 创建无目录会话，也不能把 SDK 存储目录或 cwd 当用户工作区。Character 必须经原 `freezeProjectCharacter` 解析固定 Artifact，不接受浏览器角色正文。

   分派授权是此端口的必需契约：`analyze(input, caller, beforeDispatch)` 的第三参数由助理服务提供，不得序列化，也不能忽略。`createPersonalAssistantPrologue` 分别保留 `authority.beforeStart` 和 `authority.beforeDispatch`，并加入来源/材料/偏好、`caller.validate_permissions(["home:write","model:invoke"])` 复验。Host 必须采用已透传两种 guard 的版本，Node/SDK 必须在准备、附件、DNS 等等待结束后的实际 fetch 前调用 `beforeDispatch`。只加 prepare 后检查或仅在模型返回后丢弃结果不满足授权边界；旧 Node 会被新增交错测试明确拒绝。`beforeStart` 中的短命 invocation guard 不得复用到后续模型 turn。
3. `createPersonalAssistantMaterialInspector({projectId,boardId,feed,inspectSourceAuthorization})`（`personal-assistant-sources.ts`）组合原 Feed/Inbox/Source 事实。Connector owner 已在原 checkout 的 `apps/local-host/src/connector-access.ts` 提供 `inspectSourceAuthorization(home,source)`，已只读核对签名匹配；通过 `source => inspectSourceAuthorization(homeDirectory, source)` 注入。该端口返回授权状态、connection_id、授权 revision，不返回 token。检查在模型前后和实际 effect guard 执行。单纯刷新来源 last_sync 不改变建议身份。
4. `ports.recover(requestId,offer,caller)` 必须调用**原成果 owner 的查询动作**并重新验证读取权限，返回 `{title,result}` 或 null。不得重执行原写动作；允许原材料版本已因成功执行而变化。恢复响应只返回该 owner 当前授权的成果标题；无成果用通用核对状态，绝不回传来源派生的缓存建议标题。来源撤权不等于独立成果 read 权限被撤销。
5. 可选 `ports.reuseSubjects({materials,instructions},caller)`：调用 Alchemist 原 candidates Action，返回原固定版本成果 subject、`alchemist-playbook` 原 rule id。读取/选择不产生采用记录；实际执行仍由成果 owner 留 receipt。复用 owner 已提供 `alchemist.playbook.context`，Artifact 固定版本 reader 等待动作 owner 接入。
6. 把 `handlePersonalAssistantHttp(req,res,url,{service,caller})` 接到既有项目/CSRF/Origin 检查之后，前缀 `/api/personal-assistant`，不得接受浏览器提交 actor/project 权限。所需 `home:read/home:write/model:invoke` 加各原 reader/动作权限；此模块不授予权限。
7. 现有 Home 事件到达或既有合理刷新时，调用 `service.observe(caller, window, selectedProjectMaterials)`。该方法消费 `home.events.read`，不创建另一套 scheduler。当前项目材料必须由宿主的已授权项目选择提供；来源不连接时不进入模型。
8. 首条真实可编辑成果依赖 Inbox provider 暴露 `inbox.pages.generate` prepared offer，Pages 所有 AI 经共享 Prologue；动作 owner 已接单。不要在助理中绕过 prepare 拼写作参数。

## 工作台接线（体验 owner）

`apps/workbench/src/personal-assistant-ui.ts` 导出 `renderPersonalAssistantPanel()`、`PERSONAL_ASSISTANT_STYLES`、`PERSONAL_ASSISTANT_CLIENT_SCRIPT`。Factory 输入：

```ts
{ root, api(suffix, method, body), openSubject(subject), openResult(result, subject) }
```

返回 `refresh()`、`evaluate({changes, project_materials, instructions?})`。选中原 Home 事项时传精确 subject，打开来源/成果仍由已有工作台路由负责。现有 Character 选择入口把固定引用写入助理偏好；无角色时显示 Molis 助理。

HTTP：`GET state`；`POST evaluate`；`POST preferences {revision,preferences}`；`POST feedback {id,revision,choice:'dismiss'|'snooze',remind_at?}`；`POST execute {id,revision}`；`POST recover {id}`。state.history 是脱敏元数据与 has_result；execute/feedback 只返回状态回执。查看成果必须再次 recover，不读缓存原文。

## 尚未完成的联合验收

共享生产 Home/HTTP/角色/Connector/成果打开接线尚未在本分支完成；不能称为「内部完整」或最终 Home 实操通过。两条公开来源已真实取数，真实模型与模块执行分别有证据，但**公开 Connector → 当前项目 → 真实 Prologue → Inbox/Pages 原动作 → 实际 Pages 编辑器**尚需接线后连续跑通。三次真实同类工作与方法收益联合验收、正式界面无工作区启动、已配置 Character 的实际选择路径、用户本人验收仍未完成。

新版共享 Host/Node/SDK 已与本模块联合验证 27/27：真实 SDK 无工作区正向路径，以及 9 个准备/凭据/最终网络分派交错均通过；撤权场景 fetch=0、writes=0。因此须一起整合这套运行时与助理增量，不能只拿助理补丁配旧 Node。详见 verification.md；模拟 provider transport 的 SDK 联验不等同于生产 Home→Pages 或真实模型全链路验收。
