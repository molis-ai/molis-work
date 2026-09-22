# 01：Goal 动态事件事实与重启恢复

状态：accepted。depends_on：无。执行者：直接 Grok CLI，模型 grok-4.6，effort xhigh。主 Session 已独立验收；结果见 ../../implementation.md。本项是内部完整交付的基础工作项，不单独宣称产品已接通。

## 目标与当前证据

把已经验证的动态事件原型落到真实业务模块和 SQLite：一个 Goal 可以保存局部事件类型和版本，按类型上报工作事实，查看事件和当前要求的报告结论，数据库关闭后重新打开仍完整可读。普通上报不要求 Claim、Run 或角色阶段。

当前 `modules/goals` 拥有 Goal Contract、Planning 和生命周期事实；`packages/storage` 只提供技术存储，`apps/local-host/src/project-migrations.ts` 安排业务模块迁移。现有 `events` journal 提供服务器顺序和幂等基础；原型只用 sessionStorage，尚无生产事件 API。沿现有边界实现，不把业务 SQL 放到 App/CLI/MCP。

## 输入、输出与行为

提供从 `@molis-ai/molis-work-module-goals` 公共入口可用的 typed API，公开类型通过 `@molis-ai/molis-work-contracts/modules/goals` 导出。具体类名与方法名可沿实现约定选择，在交接中列出，供下一项直接消费。

1. **配置读取与追加版本**：输入 board/goal、可信调用方提供的 actor、期望配置版本、幂等键，以及局部类型、采用规划的 ID/版本来源、要求绑定/新增要求。初始没有模板；不替用户补选模板。配置修改生成新版本与配置事件，旧版本不可覆写。只需支持增加类型、新类型版本和新增要求；不实现降低、删除或改写已有承诺。
2. **字段定义**：稳定字段 ID、名称、用途、来源、类型版本、可选通用语义分类；本项实现真实需要的 text/longtext 与必填/可选。拒绝未支持格式、重复 ID 和可执行内容配置，不引入通用 schema 平台或依赖。输入普通文本可含 HTML 字符，保存原文，后续 UI 负责转义。
3. **批量报告**：输入已登记类型 ID/版本、简短标题、领域字段及可选要求判断（supports / contradicts / unknown，可对应多项要求）。一个批次在同一事务内保存，返回事件 ID、接收游标和实际结果。结构或归属错误写入前报明确错误；合法的不完整工作观察可保存，未知不能算通过。没有附件也能记录；不实现文件访问或材料质量认证。
4. **当前要求**：读取现有 Goal 的 acceptance_criteria，保留其来源与语义；局部新增要求只能追加。配置可明确把类型绑定到已有 criterion，也可创建有稳定 ID 的额外要求，避免复制一套原有 criterion。报告只能影响同 Goal 中有效、兼容的要求；关联多要求时分别保留结论和来源。最新的相关报告更新当前报告判断，旧报告仍可独立读取。结果明确是“某 actor 报告支持/未达到/未知”，不得称作独立验证，也不得代替 human_decision 要求。
5. **读取与恢复**：配置、事件列表（服务端顺序、有限分页游标）、单事件与当前要求均可按 board/goal 读取；事件回读使用当时类型版本的字段定义。关闭数据库、重新实例化公开 API 后得到同样的事实和当前判断。新报告不影响无关要求。
6. **真实边界**：校验 Goal 归属、类型/版本归属、要求与事件引用，拒绝跨 Goal/项目引用与不存在对象；回收站 Goal 不允许新写入。actor 身份是宿主认证后的调用上下文，领域 payload 不接受伪造 user 批准/Host 连接状态。相同幂等键同请求重放原结果，不新增配置/事件；键被不同请求复用报冲突。正式配置使用期望版本防并发覆盖，历史报告可使用仍存在的旧类型版本。

使用现有 journal/事务/幂等模式；如需专属表，仅用于模块拥有的配置/查询事实，并由模块导出幂等 migration 交 Host 安排，兼容新库与已有库。不要在两个地方各自决定 Goal 完成。

## 本项明确不做

- 不改现有 Goal fulfillment、授权决定或 Host 会话状态，不自动完成/重开 Goal。本项先建立事实 API，正式状态效果由工作项 03 统一接入。
- 不接 UI、MCP、CLI 或 Runtime Skill；不移除仍在生产使用的旧入口；不声称已完成全协议切换。
- 不迁移用户真实数据库、不安装运行产物、不提交/推送、不访问外部账号或凭据，不使用 ForkLight，不生成嵌套子 Agent。
- 不改已有验收要求以绕过旧流程，不移除保护归属、授权、事务和并发的检查。

## 允许修改范围与模块关系

- `packages/contracts/src/modules/goals.ts` 与同目录新增的专属 Goal 事件 contract 文件：只放公开类型，不放 IO/业务实现。
- `modules/goals/src/`：新增事件配置/报告/读取实现和必要导出/迁移。沿用小模块结构，不扩大现有大文件，不做无关重构。
- `apps/local-host/src/project-migrations.ts`：仅装配本项模块 migration，兼容初始建库的提前 return 和旧库升级路径。
- `tests/goal-events.test.ts`（必要时同前缀测试文件）：真实生产 API + 临时 SQLite 测试。
- `modules/goals/README.md`、`docs/modules/goals.md`：仅同步本项公开事实 API 及尚未接入产品的边界。

不修改本 spec、总 spec、implementation.md、prototype 或其他共享设计文档。若需要改变允许范围，先在结果中说明具体依赖，不靠修改模块边界白名单绕过。

调用链：公开 Goals 事件 API → Goals 所有的校验/事务与配置/事件写入 → SQLite；Host 启动 → 模块 migration；读取 → 同一组配置/事件/要求事实。其他 owner 的当前状态保持其原真实来源。

## 验收与命令

兼容绑定的具体规则：未绑定类型的要求可由当前 Goal 的任意已登记类型报告；已绑定类型的要求只接受绑定列表中的类型。绑定同时包括 `requirement_bindings` 与 `new_requirements.bound_type_id`；不相容判断使整批失败，不更新任何当前判断。

测试必须调用生产公共 API，并检查返回、落库/重开后的读取及无重复/无部分副作用：

- 登记两个字段和可选内容，提交报告后重开数据库，类型、版本、payload、来源和顺序仍正确。
- 配置出第二版后，旧版本报告和新版本报告分别按其字段定义读取。
- 对多项要求报告支持，随后对其中一项给出反证/未知；该项当前判断改变，其他项不变，旧事件保持原结论；Human 要求不被 Runtime 报告冒充验收。
- 非法字段、缺必填、跨 Goal/board 引用和错误类型版本明确失败，一个批次中后项失败时前项也未落库。
- 重试同配置/报告无重复；不同内容复用键报冲突；用两个数据库连接/真实先后交错验证旧配置版本不能覆盖已提交变化。
- 在原有非空数据库上升级可重复运行，已有 Goal、journal 与其他业务记录保留；新建库也具有相同新能力。

执行：

```sh
pnpm build
node --import tsx --test --test-concurrency=1 tests/goal-events.test.ts tests/goals-command-module.test.ts
pnpm boundary:check
```

仓库改动前 pnpm build 已通过。若实际命令失败，保留最小定位输出并修根因，不放宽生产语义/测试断言来变绿。

## Handoff

完成后报告：公共 API 及调用样例、实际修改文件、迁移方式、验收命令和结果、必要缺口、下一项接入建议。只完成本项后停止，主 Session 复核后再发后续任务。不得把测试通过等同整个产品改造完成。
