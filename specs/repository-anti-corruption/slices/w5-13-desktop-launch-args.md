# W5-13 C1：桌面启动参数损坏不再冒充空参数

状态：被测的代码（`desktopLaunchArgs`、`DesktopPanelService`、旧面板表的读写）与 `tests/desktop-launch-args.test.ts` 已随 T-148（S-103）删除，下面记的是删除前的情况。原状态：Codex（修复 1）已按 #1240 首评与 Root 后续裁定完成非法写入和整项目删除的实现与定向工程验证；原 RAC-117 的存量坏记录拒绝合同保持。独立增量 REVIEW/TEST、最终头 CI、适用的批次 full 与合并待处理，C1 全线未完成；既有 #1238、#1231 源码保持冻结。

承接[总规格](../spec.md) W5-13“失败不冒充成功、错误可诊断且不泄露内容”的合同。准确基线 `7a2b01fd421731e0a78b682b18a3eeb12e69fbb2`；21 个当前 open PR 完整文件清单没有占用 `apps/desktop/`、desktop 测试或共用 logger，Root 已派本片。使用独立 managed 工作树，不写主检出或其他在途片。

当前 `src/adapters/sqlite-panels.ts` 的 mapper 在 JSON 拒绝时返回 `[]`，非数组同样静默为空，数组元素强制转字符串；同一 mapper 被 `get/list/findByWorkContext` 共用。Local Host 的 panel HTTP 把读到的参数原样变成 spawn；重开路径先读取、再改状态并返回 spawn，工作台将返回参数直接交给 PTY。坏数据因而可被说成合法的无参数启动。这是源码证据，尚未声称已在用户机器复现事故。

Root 已裁定的 A 边界：仅接受现行 JSON `string[]`，坏 JSON、合法非数组及含非字符串元素都导致这一次完整记录读取明确带码失败；所请求列表含坏记录时整次拒绝。重开在状态写入和 spawn 之前拒绝，close/mark* 按既有 get 前置条件拒绝，验证无状态、别名、事件、kill 或 spawn 修改。合法 `[]`、显式字符串（不 trim/强转）、Codex resume 以及其他 Goal/合法记录保持；不修或删原始数据。坏记录展示/恢复/单独关闭的 B 需要新增表示与 UI 合同，不在本片，也不宣称提供了坏记录恢复或完整产品体验。

错误复用现有 SDK `defineErrorCodes` 与固定安全消息，沿实际 `respondLocalWebRefusal` 出口给调用方，不带 JSON.parse 原 message/cause、argv、命令、路径或凭据。ActionError 在这里直接回答，不误称一定经过 Host 的未处理错误日志；本片不为凑日志增加 desktop → local-host 的日志依赖、不添跨包回调或第二 logger。原 RAC-117 读取实现的验证记录如下；#1240 首评补充的写入与整项目删除范围见文末，同一份需求书承接，不创建第二套合同。真实 Home/安装、C2、默认回退、自动重试、读取兼容及维护迁移不在范围。

**RAC-117**：从公开 Catalog 与真实临时 SQLite 触发当前缺口，验证原始坏数据不被改写、拒绝可诊断且错误/日志没有内容泄露；请求、列表与重开在副作用前拒绝，状态/别名/事件原样、零 kill/零 spawn，其他 Goal/合法面板继续可用。合法空参数、带空格/引号/中文的显式 `string[]` 与恢复参数保真，清除夹具故障后的下一次明确读取/恢复能成功。不只检查源码文本或 JSON 字段存在。保留既有启动/恢复测试，不调用真实用户 Runtime、日常 Chrome、真实 Home/4207 或凭据。

原 RAC-117 实现只改 mapper 的私有读取函数与现有 `desktopLaunchErrors` 一项 `launch_args_invalid: internal`，HTTP 沿 SDK 既有出口答 500，记录/API/schema/动作合同形状不变。README 明确所请求列表含坏记录则整次失败、坏记录关闭也因前置读取失败。没有写 Host 或工作台消费者、共用 logger、错误主人表、门禁、baseline 或页面资源。原新增 209 行公开入口回归，不引入包私有代码或测试专用生产出口。

验证记录（原始材料 `/tmp/molis-verify-2026-10-24/c1-rac117/`）：

- 原生产 `7a2b01fd` 先整体构建；真临时 SQLite 的坏 JSON、对象、null、字符串和混合数组均因缺预期拒绝而红，真 HTTP 同样缺拒绝；合法路径已绿。`red.log` 保留，故障不是模拟 mapper 或源码文本检查。
- 最小实现后整体构建通过。首批 4 文件 47/47：新增 8、desktop-shell-bootstrap 3、desktop-tui 35、action-mcp-stdio 1；补余下 6 文件 77/77：companion-actions 1、coss-control-language 13、i18n 11、install 23、package-inventory-gate 26、runtime-payload 3。实际 affected 的 10 文件共 124/124，无跳过、runner 重试；full/storage/uncovered 均空，不启动新 full。
- 新回归经过公开 Catalog、真实临时 SQLite、公开 Desktop Web Host 和本机 HTTP，检查安全错误、无返回启动计划、原始记录/状态/别名/项目事件/Runtime 绑定均不变、零 kill/PTY spawn，健康 Goal 可用；测试夹具显式清除故障后再请求，原 resume 身份与参数仍成功。健康面板显式关闭会走同一个 kill 端口，证明负向观察确实命中生产路由。
- 离线安装、两次整体构建、新测试严格类型、三份改动 TypeScript 的 Biome、boundary、对准确 merge-base `7a2b01fd` 的 health 通过。health 初次仅因 README 引用的新测试尚未 Git 暂存而拒绝，纳入本片新文件后复核通过；没有放宽规则或断言。原生 Rust 门禁在公共 build 槽实际执行，20 份源码 rustfmt、clippy 与 cargo tests 通过；本机 1.96.0 与 CI 固定工具链一致。
- Node 用例由公共运行器隔离 Home/文件凭据，测试经公开 HTTP 客户端带真实控制令牌及一次性键，无全局 fetch mock；Rust 用例使用自身临时文件、本机 socket 与独立剪贴板。未启动新 Chrome 批次、外部模型或用户 Agent，未操作真实 Home/4207、安装到用户系统或产品凭据；不以这些结果宣称原生 WebKit 实操、坏记录恢复、最终产品或本人验收。

CI 产品子集仅登记本片 `tests/desktop-launch-args.test.ts` 一行，与本片一同交付；Linux 执行结果待最终头 CI/独立 TEST 核实，不用本机通过替代。

原 RAC-117 首次交付前 fresh fetch 后逐提交 secrets 与 diff 复核；当时最后一提交仅补 CI 文本清单及本规格，生产/测试源码与 `fe285283172e025abf05e671052b83687d0ee9cc` 相同，复用有效 124 项、构建和原生结果，另跑清单规则与最终门禁。首次交付为完整非 Draft PR，首评由流水线路由 Claude ac-review、修后 Codex 增量复查。该首次源码冻结点由下述同 PR 修复接续，不把首次结果冒充新增修复的验证。

## #1240 首评修复

修复基线 `3ce6270b7297382a9e07051c35959b4b89d882bf`。首评指出 `ProjectDeletionService` 为检查存活终端而完整映射面板，损坏的参数会在检查前抛错，阻止已确认的整项目删除；`DesktopPanelService.open` 又会把非数组变成空数组、把数组元素强转字符串，继续写入不合法参数。两项在原 PR 一次修齐。

面板表仍由 desktop 的 SQLite 适配持有；给现有 `DesktopPanelRepository`、`DesktopPanelCatalogApi` 增加只读 `listIds(projectId): string[]`，经 Catalog 的既有 `desktopPanels` 子口取得项目内面板 ID。删除服务仅用这些 ID 检查进程中的终端，不读取启动参数；其后释放 Runtime、Catalog 事务删除、各 owner 清理和持久化回执重试顺序保持。不给坏记录补值，也不改变单面板读取、重开、关闭的完整记录拒绝。

写入在事务、别名、绑定和事件之前检查可选 `launch_args`：未提供仍为 `[]`；提供时必须是所有元素均为字符串的数组，保留空串、空格和原字节。Root 明确裁定同一现有 desktop 错误字典区分原因：存储损坏保留 `desktop.launch_args_invalid` / `internal` / HTTP 500；非法输入增加 `desktop.launch_args_input_invalid` / `invalid` / HTTP 400。两者使用固定安全消息，不回显输入或 cause。SDK 状态映射、动作 schema/version 和错误模型不变；必要 API 快照只同步上述窄查询签名，对现有调用方的变化是非法写入被拒绝，合法调用不变。

真实 HTTP 的 `openGoalPanel` 也会先强转 `body.args`，必须在同一修复中去掉转换、原样交给 desktop 的启动参数 owner 检查。启动准备与直接写入共用严格检查；HTTP 的内部 `PanelHttpContext.launchSpec` 参数接受未知外部值，由 owner 拒绝。即使请求带 resume，显式非法参数也先拒绝，不通过忽略参数产生成功。该调整只涉及现有路由和启动准备，不增加路由、动作或权限。

共用检查为 desktop 公开的 `desktopLaunchArgs(value: unknown)`，`desktopLaunchSpec.args` 如实接受未知边界值后由它校验；返回仍为 `string[]`。共享 contracts 只增加上述两个必需的 `listIds` 签名并同步 API 快照，`DesktopPanelApi` 与记录/写入类型保持。自行提供仓储或 Catalog 适配的调用方需实现窄查询；本仓库的唯一现行适配与消费方已一同更新，不留旧接口回退。

- **RAC-117-DELETE**：在真实临时目录/SQLite 的坏参数上，经公开删除服务确认无活终端可以完成删除；持久化面板、别名、Runtime 绑定及项目目录清理，回执按可信 actor 留存且重放不再询问终端/释放 Runtime，其他项目保持。坏记录对应活终端仍明确拒绝且零清理；确认和 Runtime 释放顺序保留。
- **RAC-117-INPUT**：公开 Catalog 和真实 HTTP 的非法非数组/非字符串元素输入在写入前返回精确的新错误；持久化面板、别名、绑定、事件及 PTY 副作用为零，响应/日志无私密内容。省略仍 `[]`，合法空参数、显式字符串和 resume 保真；原真实 HTTP 坏存量读取仍为 500 和原码。

新增回归先在 `3ce6270b` 的生产代码上证明红例，再验证修复后的生产路径。按包要求及增量 affected 运行定向回归、整体构建、boundary/API/health 和推送前 secrets；原有效 143 项及未变 Rust 的原生证据保留，full 由流水线/Claude 统一排期，本修复不另起。固定同一头直交独立 REVIEW/TEST 与流水线，并抄 Root；新增结果以实际日志补充，不以实现或本机通过代替合入和产品验收。

修复验证（原始材料 `/tmp/molis-verify-2026-10-24/pr1240-launch-args-fix/`）：

- 原 `3ce6270b` 整体构建后，真实公开路径 34 项中的原 8 项通过、新增 26 项失败：直接写入及 generic/Codex resume HTTP 缺少拒绝，坏参数令活终端检查和无活终端删除提前变成旧 500。`red.log` 保存实际错误与调用栈。
- 修复后整体构建通过；`green.log` 的 34/34 通过，覆盖 **RAC-117-INPUT** 与 **RAC-117-DELETE**。删除夹具实际持有驻留 Host、打开项目并调用真实 `closeProject`，搜索 owner 也实际清理；首次仅用已关闭 Host 的夹具按原规则留下 search pending，诊断保存在 `deletion-diagnostic.log`，补齐真实 owner 后保留 complete 断言通过。最终两项删除另在 `deletion-final.log` 通过，没有生产代码补偿或弱化断言。
- 增量 affected 的其余 121 个非浏览器文件全部通过，共 1802/1802；唯一浏览器文件 `runtime-plugin-http-discovery` 20/20 通过，使用专用 `molis-test-browser` 和公共独立 profile，结束已释放。连同新回归，有效并集 123 文件、1856/1856，无跳过、runner 重试或 flaky。包 README 的必跑均已覆盖；原 143 项不是另加到这个计数里。
- 离线安装、API 快照更新、新测试 strict TypeScript、七份改动 TypeScript 的 Biome、boundary、对准确 merge-base `7a2b01fd421731e0a78b682b18a3eeb12e69fbb2` 的 health 均通过。公共 baseline、门禁、错误主人表、CI 清单、页面资源与 Rust 未改；保留原真实 native 证据，不机械重跑。
- affected 的 `storage` 为空，`full` 因共享合同及跨三包建议；按 Root WO 交由 Claude 在最终集成树统一排期，本修复未另起。静态选择器将 `web-panel-routes.ts` 列为未直接引用，但新增真实 HTTP 从生产路由覆盖其拒绝、合法参数与 resume 路径，不能把这个静态提示写成未做运行验证。

推送前执行 fresh fetch、逐提交 secrets 和最终 diff 检查，结果随固定头交接。独立复审、独立 TEST、最终 CI、批次 full、实际合入与本人产品验收仍按各自证据确认；不因本机工程通过将整条 C1 标为完成。
