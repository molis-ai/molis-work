# W5-13 C1：桌面启动参数损坏不再冒充空参数

状态：Codex（实现 1）的 RAC-117 实现与定向工程验证完成；按 Root 已裁定的 A 拒绝坏记录。独立 REVIEW/TEST、最终头 CI 与合并待处理，C1 全线未完成；既有 #1238、#1231 源码保持冻结。

承接[总规格](../spec.md) W5-13“失败不冒充成功、错误可诊断且不泄露内容”的合同。准确基线 `7a2b01fd421731e0a78b682b18a3eeb12e69fbb2`；21 个当前 open PR 完整文件清单没有占用 `apps/desktop/`、desktop 测试或共用 logger，Root 已派本片。使用独立 managed 工作树，不写主检出或其他在途片。

当前 `src/adapters/sqlite-panels.ts` 的 mapper 在 JSON 拒绝时返回 `[]`，非数组同样静默为空，数组元素强制转字符串；同一 mapper 被 `get/list/findByWorkContext` 共用。Local Host 的 panel HTTP 把读到的参数原样变成 spawn；重开路径先读取、再改状态并返回 spawn，工作台将返回参数直接交给 PTY。坏数据因而可被说成合法的无参数启动。这是源码证据，尚未声称已在用户机器复现事故。

Root 已裁定的 A 边界：仅接受现行 JSON `string[]`，坏 JSON、合法非数组及含非字符串元素都导致这一次完整记录读取明确带码失败；所请求列表含坏记录时整次拒绝。重开在状态写入和 spawn 之前拒绝，close/mark* 按既有 get 前置条件拒绝，验证无状态、别名、事件、kill 或 spawn 修改。合法 `[]`、显式字符串（不 trim/强转）、Codex resume 以及其他 Goal/合法记录保持；不修或删原始数据。坏记录展示/恢复/单独关闭的 B 需要新增表示与 UI 合同，不在本片，也不宣称提供了坏记录恢复或完整产品体验。

错误复用现有 SDK `defineErrorCodes` 与固定安全消息，沿实际 `respondLocalWebRefusal` 出口给调用方，不带 JSON.parse 原 message/cause、argv、命令、路径或凭据。ActionError 在这里直接回答，不误称一定经过 Host 的未处理错误日志；本片不为凑日志增加 desktop → local-host 的日志依赖、不添跨包回调或第二 logger。只改 desktop 读取适配及必要同包错误声明、独立公开入口回归与本 slice/必要 README；Host/工作台消费者只读，API/schema、open 输入原有行为、真实 Home/安装、C2 均不改。无默认回退、自动重试、读取兼容或维护迁移。

**RAC-117**：从公开 Catalog 与真实临时 SQLite 触发当前缺口，验证原始坏数据不被改写、拒绝可诊断且错误/日志没有内容泄露；请求、列表与重开在副作用前拒绝，状态/别名/事件原样、零 kill/零 spawn，其他 Goal/合法面板继续可用。合法空参数、带空格/引号/中文的显式 `string[]` 与恢复参数保真，清除夹具故障后的下一次明确读取/恢复能成功。不只检查源码文本或 JSON 字段存在。保留既有启动/恢复测试，不调用真实用户 Runtime、日常 Chrome、真实 Home/4207 或凭据。

实际实现只改 mapper 的私有读取函数与现有 `desktopLaunchErrors` 一项 `launch_args_invalid: internal`，HTTP 沿 SDK 既有出口答 500，记录/API/schema/动作合同形状不变。README 明确所请求列表含坏记录则整次失败、坏记录关闭也因前置读取失败。没有写 Host 或工作台消费者、共用 logger、错误主人表、门禁、baseline 或页面资源。新增 209 行公开入口回归，不引入包私有代码或测试专用生产出口。

验证记录（原始材料 `/tmp/molis-verify-2026-10-24/c1-rac117/`）：

- 原生产 `7a2b01fd` 先整体构建；真临时 SQLite 的坏 JSON、对象、null、字符串和混合数组均因缺预期拒绝而红，真 HTTP 同样缺拒绝；合法路径已绿。`red.log` 保留，故障不是模拟 mapper 或源码文本检查。
- 最小实现后整体构建通过。首批 4 文件 47/47：新增 8、desktop-shell-bootstrap 3、desktop-tui 35、action-mcp-stdio 1；补余下 6 文件 77/77：companion-actions 1、coss-control-language 13、i18n 11、install 23、package-inventory-gate 26、runtime-payload 3。实际 affected 的 10 文件共 124/124，无跳过、runner 重试；full/storage/uncovered 均空，不启动新 full。
- 新回归经过公开 Catalog、真实临时 SQLite、公开 Desktop Web Host 和本机 HTTP，检查安全错误、无返回启动计划、原始记录/状态/别名/项目事件/Runtime 绑定均不变、零 kill/PTY spawn，健康 Goal 可用；测试夹具显式清除故障后再请求，原 resume 身份与参数仍成功。健康面板显式关闭会走同一个 kill 端口，证明负向观察确实命中生产路由。
- 离线安装、两次整体构建、新测试严格类型、三份改动 TypeScript 的 Biome、boundary、对准确 merge-base `7a2b01fd` 的 health 通过。health 初次仅因 README 引用的新测试尚未 Git 暂存而拒绝，纳入本片新文件后复核通过；没有放宽规则或断言。原生 Rust 门禁在公共 build 槽实际执行，20 份源码 rustfmt、clippy 与 cargo tests 通过；本机 1.96.0 与 CI 固定工具链一致。
- Node 用例由公共运行器隔离 Home/文件凭据，测试经公开 HTTP 客户端带真实控制令牌及一次性键，无全局 fetch mock；Rust 用例使用自身临时文件、本机 socket 与独立剪贴板。未启动新 Chrome 批次、外部模型或用户 Agent，未操作真实 Home/4207、安装到用户系统或产品凭据；不以这些结果宣称原生 WebKit 实操、坏记录恢复、最终产品或本人验收。

最终推送前 fresh fetch 后逐提交 secrets 与 diff 复核；共享 CI 产品子集的新用例一行已交流水线确认写入归属，不擅自复用上一片的单行授权。最终一个完整非 Draft PR，首评由流水线路由 Claude ac-review、修后 Codex 增量复查，固定头/差异/原始证据直交流水线并抄 Root。作者交付后源码冻结并释放资源，不等待旧片的 CI/full/合并，也不自领新片。
