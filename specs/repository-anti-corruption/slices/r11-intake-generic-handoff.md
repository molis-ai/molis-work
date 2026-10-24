# R11 片：Inbox／灵光转待办走通用创作入口

状态：评审中（2026-10-24）。Inbox 与灵光的「转为待办」改成通用的来源对象按钮，工作台和宿主不再认识 Todo 的输入；定向测试通过，待统筹集成全量。

验收编号：RAC-135～137。

对应 [privileges.md](../privileges.md) 的 PG-063 与 [spec.md §1.1](../spec.md) 登记的 #1018 Todo 宿主私路（报告 §2.8）；两处的状态与「已清理」说明由统筹合入后统一改。

## 范围

之前：Inbox 和灵光的按钮带 `data-make-todo` 一串属性，工作台一看到就按 Todo 的输入格式（`title`、`sources`、`placement`、`request_id`）调 Todo；宿主为此留了 `plugin-page-todo.ts` 专用适配，隔离页的 POST 白名单里写着 Todo 的路径，frame 里还有一份 `todo.ts` 中继。

现在：

- Inbox、灵光的按钮是 `data-context-intake="todo"`，只带对象的 id、标题和文字。工作台（`context-bus.ts` 的 `molis:context-intake`）按页面所在的 surface，读运行中的声明（`GET /api/contextual/surfaces`）得到这个页面打开的对象种类和插件，拼出一份情境焦点，交给 `POST /api/contextual/create`。创作入口是 `todo.items.create` 上已经声明的 `intake`（`intake_id: "todo"`，`todo.fragment.offers` 准备），由 Todo 自己起草、新建、记来源；同一对象同一请求号，再点找到原来的那件。
- `POST /api/contextual/create` 除 `key` 外接受 `intake_id`：页面从没见过候选列表里的 key，由宿主在这个对象此刻提供的候选里按 Todo 声明的 id 找（`intakeKey`，一个都没有或有两个同名都拒绝）。
- 删除：`apps/local-host/src/plugin-page-todo.ts`、`apps/workbench/src/browser/plugin-frame/todo.ts`、工作台 `[data-make-todo]` 的处理与样式、`data-todo-available`、隔离页 POST 白名单里的 Todo 路径。frame 里改成通用的 `context-intake` 中继（`plugin-frame/intake.ts`）。
- 来源回原条目：Todo 的来源只记对象（`subject`），不再带 `open`。详情页向宿主问 `host.surfaceFor(kind)`，工作台在 frame 外按 `/api/contextual/surfaces` 反查（`plugin-frame/subjects.ts`）：种类唯一对应一个页面才给，没有或不止一个就返回 `null`，来源只显示文字，不猜。

## 决策记录

- 不升 fragment 输入 v2，来源打开由工作台按声明解析（统筹 10-24）。
- 被否决的：A 丢掉回原条目的功能并删断言；C 给 fragment 输入加 `open` 并升 v2（动所有 fragment 动作的快照，面太大）。
- 项目归属要保住（统筹 10-24 评审裁定）：Inbox、灵光在项目里转出的待办仍属于这个项目（`placement: "project"`、项目是当前项目），不是未分配。通用入口原先不带落位，这是平台缺口，补在入口上：创作入口的准备查询 `todo.fragment.offers` 本来就在调用上下文里运行，由它读调用者的项目（`todoCallerProject(caller)`，可信，不读输入），整个对象（`fragment.granularity === "object"`）转待办时给 `placement: project ? "project" : "personal"`，与原来页面上的按钮一致；选中一段文字仍不带落位，留给本人（`contextual-todo.e2e` 原断言不变）。不新增合同字段，也不让入口认识 Inbox 或灵光的对象种类。
- 约束（统筹 10-24）：工作台里没有 kind→插件的手写表，不点插件 id；`UiPluginClientHost.surfaceFor` 是现有 ui 合同上的一个方法，页面事件 `molis:context-intake` 登记在 `dom-events.ts`，都已刷新 API 快照。

## 行为差异（有意）

- 完成反馈是情境完成卡（「已记成待办」，带「打开」「撤销」），不再是按钮旁的一行状态。
- 来源的种类是 `material`（原来是 `inbox`／`lingguang`），`open` 为空，`subject` 仍是 `inbox_entry`／`lingguang_spark`；标题取文字的第一句（最多 80 字），全文进备注。
- 升级前转过的条目再转会新建一条（请求号不同，按「没有旧数据」处理）。
- 页面上没有 Todo（停用）时按钮不再自己隐藏，点击得到拒绝提示；要不要通用地隐藏创作入口不可用的按钮另议。

## 验收

- RAC-135：Inbox 转出的待办属于当前项目（e2e 里「Inbox 属于项目，转成的待办也在这个项目」原样保留）；工作台、宿主和 Inbox／灵光代码里没有 `data-make-todo`、`plugin-page-todo`、`todo-made`、`data-todo-available`；Inbox 与灵光按钮只带 `data-context-intake="todo"`、对象 id、标题和文字；点它经通用创作入口新建待办，再点不重复新建（`tests/todo-from-inbox.test.ts`、`tests/todo-from-inbox.e2e.test.ts`）。
- RAC-136：来源按声明回到原条目——Inbox 条目、灵光、Pages 选区转出的待办，来源都是可点的链接并打开原对象；没有页面或不止一个页面声明同一种对象时只显示文字（`tests/todo-from-inbox.e2e.test.ts` 的两条「点来源回原条目」断言原样保留，`tests/contextual-todo.e2e.test.ts` 加 Pages 选区一条）。
- RAC-137：`POST /api/contextual/create` 按 `intake_id` 找创作入口，一个都没有或两个同名都拒绝（`tests/contextual-create.test.ts`）；隔离页的 Todo POST 仍被拒（`tests/security-invariants-plugin-pages.test.ts`）；`molis:context-intake` 在 `dom-events.ts` 登记（`tests/dom-events-contract.test.ts`）。

## 没做

- 页面资源字节：工作台脚本与 frame 脚本变小或持平，见 `tooling/gates/page-assets.json`（同步）。
- 创作入口不可用时按钮的通用隐藏；让转出来的待办带上项目——两者都需要创作入口多带一项，另议。
