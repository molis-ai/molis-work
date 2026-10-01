# 项目内 Sessions 管理目录

日期：2026-08-31

完成等级：3 · 功能可用

## 背景与当前证据

现有 Session Registry 已经把 Molis Work Session、Runtime 原生 Session、Project、当前 Goal、Goal 历史和工作目录分开持久化；项目工作台也已经能显示真实 Session 记录、按需读取执行内容并请求原 Runtime 加载。但目录仍缺少真实管理闭环：添加、关联、转移、切换 Goal、归档和恢复要么没有入口，要么仍是页面内演示。

Molis Work 中本 Goal 的早期 Contract 仍写着“全局与项目内 Sessions 管理目录”。用户后续已明确纠正为：Sessions 和工作目录只出现在选定 Project 内，与 Goals 平级；全局 `/sessions` 不提供第二套管理页。`PRODUCT.md`、`DESIGN.md` 与已验收的高保真切片均已记录这一最新决定。本 Work Item 以最新用户决定为准；旧 Contract 的全局页面条款不伪装成已完成，并在交付时作为 Contract 偏差写回 Molis Work。

## 保留、替换、忽略

### 保留

- 项目根目录内 Goals、Sessions、工作目录平级；Sessions 继续复用 Goal Tree 的左侧目录与 Goal Detail 的右侧工作面。
- Session 内容按需读取、原 Runtime 加载和 Handoff 占位保持现有边界。
- Runtime 原生能力、Molis Work fallback 和 unsupported 三种能力等级继续由 Adapter 决定。
- 全局 Session Registry 是唯一事实源；项目目录只做 `project_id` 过滤。

### 替换

- 把页面内演示的 Session 管理按钮替换为真实、原子、可恢复的 Registry 写入。
- 把单一“内容来源”筛选扩展为标题/ID/Runtime/Goal/工作目录/状态/时间搜索，以及 Runtime、状态、内容能力和更新时间排序。
- 用一个紧凑的“添加 Session”流程承载“加入已有 Runtime Session”和“创建新 Session”，并在提交前显示能力边界和确认项。
- 用一个关系编辑流程维护唯一 Project、当前 Goal 和工作目录；转移或移出当前 Project 时自动结束当前 Goal 关系并保留历史。

### 忽略

- 不新增全局 Sessions 管理页面；全局兼容路由继续回到 Project 选择。
- 不在本 Work Item 实现跨 Runtime Handoff；Handoff 仍属于独立 Goal。
- 不删除 Runtime 原生内容，不做跨 Session 正文全文索引，不做批量操作。
- 不实现工作目录记录自身的关系维护；它属于工作目录管理 Goal。

## 用户流程

1. 用户在 Project 根目录进入 Sessions；目录只显示这个 Project 的 Session。
2. 用户通过搜索、Runtime/状态/内容能力筛选和更新时间排序快速定位记录。
3. 用户点击“添加 Session”，选择加入已有原生 Session 或创建新 Session；Runtime、工作目录和可选当前 Goal 在一个确认面中提交。
4. 支持 discover 的 Runtime 在用户打开添加流程时只同步标题、状态、工作目录和时间等元数据，不读取正文；弱能力 Runtime 只显示 Molis Work 可证明的记录或创建 Molis Work 托管记录。
5. 用户在详情中编辑关系：保留当前 Project、转移到另一个 Project或移出 Project；可以设置/切换/清空当前 Goal，并维护工作目录。所有变更都需要逐次勾选确认。
6. 用户可归档或恢复 Molis Work Session 记录；这只改变 Registry 状态，不删除或关闭 Runtime 原生 Session。
7. 写入成功后重新读取同一 Registry 并刷新目录；失败时保留输入，显示具体恢复方法。

## 模块与调用链

### `src/sessions/registry.ts`

- 继续拥有 Session 关系的原子事务。
- 新增确认后的状态切换，仅允许 `active <-> closed`，不修改 Runtime 原生内容。
- Project 或当前 Goal 变化继续通过 `session_goal_links` 保留历史；单次事务只更新目标 `session_id`。

### `src/sessions/directory.ts`

- 作为 Sessions 目录应用服务消费 Adapter Router 与 Registry。
- `discover` 只读取 Runtime `thread/list` 元数据并写入无 Project/Goal 关系的 discovered 记录；不调用 `thread/read`。
- `create` 按 capability 选择 Runtime 原生创建或 Registry fallback；原生返回后再以统一 Registry 记录进入目录。
- 解析失败返回明确错误，不把空结果当成功，不按 Runtime 名称散落业务分支。

### `src/web/server.ts`

- 保留项目隔离的 `GET /api/sessions`、内容与 resume API。
- 新增 discover、添加/创建、关系更新、归档/恢复 API；所有 mutation 继续经过本地 Origin、control token 与一次性操作键校验。
- Project、Goal 和 Session 的关系在服务端重新验证；跨 Project 访问仍返回 404。

### `src/web/project-session-workspaces.ts`

- 只扩展现有项目内目录、详情与确认 dialog，不建立新壳层或全局页面。
- 添加、关系与归档动作使用真实 API；成功后回到 `#sessions` 并重新读取权威事实。
- Handoff 继续明确提示属于下一工作项，不制造假成功。

## 输入、输出与不变量

- 输入：当前 `project_id`、目标 `session_id`、Runtime、原生 Session ID、可选 Goal、可选绝对工作目录和用户确认。
- 输出：一条更新后的 Molis Work Session 记录、Goal 历史和 capability 摘要。
- 一个 Session 同时最多一个 Project 和一个当前 Goal。
- 转移或移出 Project 时，当前 Goal 自动变为历史；不把原 Project 的 Goal 带入目标 Project。
- 空工作目录表示解除该关系；非空必须是绝对路径。
- 归档只设置 Molis Work `status=closed`；恢复设置 `status=active`。
- discover 不能写 Project、Goal 或工作目录关系，不能预读正文。
- 所有写动作只影响目标 Session，并要求 `user_confirmed=true`。

## 验收标准

1. `tests/session-project-actions.test.ts` 证明新建、加入已有、关联/解除/转移 Project、设置/切换/清空 Goal、工作目录更新和归档恢复均为单 Session 原子写入；Goal 切换保留历史，同目录其他 Session 不变。
2. `tests/session-directory.test.ts` 证明 discover 只同步元数据、不读取正文、不自动关联 Project；fallback 不夸大能力；刷新和 Registry 重开后结果一致。
3. 项目 Sessions 目录支持元数据搜索、Runtime/状态/内容能力筛选和更新时间排序；归档记录可恢复；原 Runtime 加载与 Handoff 动作按能力和独立 Goal 边界呈现。
4. 添加、关系变更、转移、移出、归档和恢复均有提交前确认、加载/失败状态和防重复提交；服务端再次校验 Project 与 Goal 边界。
5. 项目根目录仍保持 Goals、Sessions、工作目录平级；桌面和窄屏使用同一目录—详情层级，无下划线、错误箭头、横向溢出或新增 switch。
6. 全局 `/sessions` 继续返回 Project 选择，不出现第二套全局管理页；这一点按最新用户确认验收，并记录与旧 Goal Contract 的差异。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/session-project-actions.test.ts tests/session-directory.test.ts tests/session-web.test.ts tests/session-registry.test.ts
pnpm build
git diff --check
```

UI 另外在真实本地项目页面完成一轮桌面与窄屏浏览器检查，覆盖添加、筛选、关系变更确认、归档/恢复、空结果与失败反馈；最多修正一轮后复核一次。

## 风险与开放边界

- Codex `thread/start` / `thread/list` 的响应字段由 app-server 协议控制；解析层必须兼容已验证的 `data` / `threads` 集合和 `thread.id` / `id`，未知结构要失败而不是猜测。
- 创建新的原生 Runtime Session 只证明 Session 已创建并登记，不自动发送消息或推进 Goal。
- 旧 Goal Contract 的“全局管理页”条款与最新产品决定冲突，因此本 Work Item 不能用该条款宣称全量通过；应由 Molis Work 后续纠正 Contract 或用新 Goal 取代旧条款。
