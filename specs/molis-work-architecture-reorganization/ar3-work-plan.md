# AR3 — Artifacts Native Plugin 与结果入口

权威范围：`goal-reorg-ar3` revision 1、总 spec §6 / §20.13 与 Native Plugin 边界。完成等级目标是现有结果入口功能可用且迁移可验证，不代表完整 Team 同步或整体重组已发布。

## 当前基线与判断

- AR1 已提供真实 Artifact id/version、opaque payload、内容引用、生命周期、producer binding 与 consumer compatibility API；AR2 已提供跨对象关系和临时上下文重建。
- `plugins/native/artifacts` 仍为 contract-only，没有列表、详情或嵌入实现。
- `src/web/server.ts` 的 `/api/project-references/:reference` 是已存在的文件读取入口，包含 Evidence locator 对照、verified 状态和原 workspace 选择；这些校验不能在迁移中丢失。
- `src/web/render.ts::renderReference` 负责结果/来源链接展示。Evidence/Run 的主要单元格已在 EX4 迁移，不能再把 Evidence verdict、Review 决定或 Run 状态当 Artifact 事实吸收。
- 普通 URL、`project://` locator、Run output_refs 只是引用；私人 Handoff 和未发布恢复包继续归 Work。不能为实现迁移而自动捏造 Artifact version 或分享决定。

## 顺序与模块边界

1. 对账结果/文件展示与读取入口、现有引用种类及调用者，固定原返回、隐私和错误基线。确认符合 Artifact 定义的结果转换方式，不批量改写原 Evidence 或 Run 历史。
2. Native Artifacts 只消费 Artifacts / Ledger / Evidence 的公开 API，拥有列表、详情、嵌入及相应 presenter/route 行为；不导入 Store、SQL、文件系统或 producer Plugin 实现。
3. Workbench / Local Host 组装 Artifact UI Contribution、数据端口和安全内容读取，接入现有 UI Host 槽位。Module 保留事实与版本规则；消费兼容性按 type/schema 判定，没有 consumer 时仍可展示元数据和可用性，不假装能解释 payload。
4. 迁移实际 caller，删除已验证退出的 render/server 职责。旧引用保留可读，转换结果保留来源；操作失败不改变 Goal fulfillment、Evidence result、Run 或 Review。
5. 验证生产 API、旧引用迁移/重开/失败恢复、列表/详情/嵌入、缺失文件、未知 consumer、精确版本和跨 Project 拒绝，并进行该切片 UI / E2E。全产品模拟用户验收仍留在全部开发完成之后。

## 验收与命令

- `ar3-boundary`：Artifact Plugin 只通过公开 Contract；UI Host 只注册与挂载，不拥有 Artifact 事实。
- `ar3-legacy-exit`：结果展示/读取策略在正确 Plugin/Module，root 仅组合；逐项记录旧 caller 退出，不以包名或行数代替完成。
- `ar3-result`：真实列表、详情、嵌入、无兼容 consumer 和错误状态；迁移前后结果内容与引用能对账，Goal/Evidence 状态不变。

使用受影响包 build、根 `pnpm exec tsc --noEmit -p tsconfig.json`、定向 Plugin/Artifact/文件读取/Web 测试、`pnpm boundary:check`；最后完整构建回归与浏览器实际操作。不把模板页面或内存测试当作端到端完成。

## 当前接续

第一条迁移链路固定为现有 `/api/project-references/:reference` 的内容打开：Native Artifacts 通过 `EvidenceQueryApi.getProjectReferenceSource(boardId, evidenceId)` 读取定位信息，核对精确 locator 和 verified 状态，选择记录的原 workspace；宿主注入 Evidence Module 已有安全 reader，保留越界、符号链接、文本和大小限制及原状态码。用一次公开查询替代旧 Web snapshot + source 查询；不新增 Artifact、不改 Evidence，也不把文件安全实现复制到 Plugin。

本步允许修改 Native Artifacts 公开入口和 reference application、Web 调用组合、包注册/依赖、对应测试及开发说明。验收用 Plugin 定向测试和现有 Web 真 HTTP 项目引用测试（含原 workspace、删除文件、重新验证恢复）证明旧行为；列表、详情、嵌入及正式 Artifact caller 仍属于 AR3 后续必需工作，本步不提交 AR3 完成。

UI 第一条 caller 同步迁移 `renderReference`：保留现有 `inline-ref`、外链打开、项目文件 endpoint、复制按钮、Evidence query 和动态语言；Native Artifacts 提供嵌入 contribution，Workbench 用现有 UI Host 挂载，root 仅传入转义/图标/翻译函数。现有 Goal/Evidence/Run 显示的调用签名不变。视觉为既有 Calm Desktop 的局部迁移，不新增视觉方向、动效、样式或系统文档规则。

## 2026-09-05：第一条 caller 已迁移，AR3 尚未完成

已落地：`project-reference.ts` 拥有原 workspace / Evidence 校验编排；`reference-ui.ts` 拥有 URL、项目文件与复制引用展示；Workbench 注册 contribution；root render/server 只组合。文件安全 reader 保持唯一原实现，无数据迁移或事实写入。

验证通过：

- Artifact Plugin 和 Workbench build；根 TypeScript 检查。
- `tests/artifact-project-reference.test.ts` 4 项：原 workspace 字节、缺失文件不读另一目录、Evidence 拒绝、旧 workspace fallback、普通引用及安全 reader。
- `tests/artifact-reference-ui.test.ts` 3 项：原 endpoint、精确 Evidence query、外链/不透明引用、转义和请求级中英文。
- 与 `tests/workbench-ui-platform.test.ts` 合计 11 项通过。
- UI caller 切换后完整 `tests/web.test.ts` 59 项通过，包含真实 HTTP、工作区/worktree、越界/符号链接、文本/大小限制和既有 Goal/Evidence 路径。
- 包边界：48 packages、254 source files、602 imports、65 dependency edges，零错误。去掉 AR1 时代写死 Plugin 为 contract-only 的过期断言，未放松事实所有权或跨包边界。

浏览器检查使用独立合成项目（不操作用户数据）：从 Goal 记录进入“执行与检查”，看到文件、外链和不透明引用，复制按钮显示“引用已复制”。桌面 1024×576 截图存于 `.impeccable/review/ar3-reference/desktop.png`。内置浏览器对文本文件页返回 `ERR_BLOCKED_BY_CLIENT`，不能声称文件新页已通过浏览器端验收；HTTP 文件字节与状态验证已通过。内置 viewport 设置未生效，CDP 模拟后 DOM 报告 390×844 且无横向溢出，但捕获画面缩放/点击映射异常，窄屏交互仍未验证。已恢复临时视口覆盖；不通过修改产品安全边界解决测试浏览器限制。

接下来仍需：正式 Artifact 列表、精确版本详情与嵌入；按 type/schema 的 consumer 接入/缺失状态；eligible 结果迁移与应用 caller；切片浏览器验收与独立 UI 审查。Plugin Runtime 当前仅有 Integration contribution，不应为此假装存在已安装 Artifact consumer，也不能让 Native Artifact 按 producer Plugin ID 消费。必须先确定这个现有 API 边界内的调用组合，再实现正式浏览链路。全产品 E2E 与最后架构审计仍是整体重组的必需工作。

## 正式浏览链路的实施边界

- Native Artifacts application 通过注入 `ArtifactsQueryApi` 读取当前 Project 的版本列表和精确版本；不持有 Repository。URL 只接受显式正整数 version，缺失版本/跨 Project 不回退 latest。
- `/artifacts` 与 `/artifacts/:id/versions/:version` 使用现有单目录/详情视觉；返回项目目录的入口保持可见。Workbench 只组合 UI Host、文档、样式与公用图标/翻译，root server 只绑定当前 Project、公开 query 和 HTTP。
- `directory`、`detail`、`embed` 是正式 UI Contribution surfaces。consumer 能力从宿主注入的 type/schema Contract 获取，默认空集，兼容性由 Module 判定；本步不扩展 Plugin Runtime 安装/运行协议，也不注册虚构 consumer。没有 consumer 仍可查看元数据及明确标为原始 JSON 的 inline 内容；引用型内容保留为可复制 locator，不假装其当前文件字节仍对应旧版本。
- 精确版本导出是本地只读 JSON 下载，保留 opaque payload、metadata、provenance 和 id/version；不是 Team 发布/同步，不改 scope 或 Goal/Evidence。页面不提供自动版本分配或普通 locator 批量转换。
- 对应验证：真实 Module → Plugin → Workbench → HTTP 列表/详情/导出；多个版本、未找到、跨 Project、无 consumer、unavailable/archived、HTML 转义、空列表、精确引用；浏览器验证列表选取、返回、原始内容与版本下载。迁移与 installed consumer 的剩余边界不借此宣称完成。

## 2026-09-05：正式浏览链路已接入，进入嵌入与旧 caller 收口

已接通列表、精确详情、本地导出、项目前缀与一级目录，新增英文文案由 Native Plugin 持有。真实 HTTP 4 项、旧引用/Workbench 11 项和完整 Web 59 项通过，边界检查无错误。Chrome 已实际操作版本选择、JSON 展开、下载与窄屏返回；原 Goal 的文件引用也在新页读到原始字节。复制提示成功但读回未匹配，仍保留验证缺口。

独立 UI 审查要求删除未实现的插件安装指引，修正后该项 `resolved` / `ship`。完整证据与剩余项见 [AR3 浏览入口阶段验证](ar3-browser-validation.md)。正式 embed 的产品消费 caller、完整旧结果引用对账仍未关闭，不提交 AR3 完成。

## 正式嵌入 caller 的实施边界

在现有 Goal“上下文”按需加载的 completion panel 中挂载 Artifact contribution，仅消费当前 Project 的 Context Ledger 中明确的 `goal.input` / `goal.output` → `artifacts` 精确版本关系。不创建关系、发布结果、解释字符串 locator 或读取私人 Session。

Native Artifact application 从 Ledger 公开 Query 取关联，从 Artifact 公开 Query 取精确版本；缺失版本保留 id/version 及错误提示，不回退 latest。Workbench 用 UI Host 的现有挂载能力组合嵌入内容和既有主题；Goal 页面显式提供展示位置，root HTTP 只绑定当前项目与公开 API。不把它加进全 Goal snapshot，不在页面初始化时读取全部 Artifact payload。

验收覆盖真实关系→Goal lazy panel→嵌入→指定版本详情：输入/输出版本区分、无 consumer、丢失版本、unavailable/archived、解除关系后重开、跨 Project 拒绝、无关系时旧页面不变，以及所有读取不改变 Goal/Evidence/Artifact/关系事实。此实现不增加建立 Artifact 关系的 UI 或新生产插件；关系写入仍由原语义 owner 显式调用公开 API。

## 复制引用验证的环境边界

浏览器工具的粘贴被其虚拟剪贴板拦截（明确报 `Browser Use virtual clipboard has no data to paste`），原生 App 接口连续两次超时。本轮不修改产品复制逻辑，也不把工具限制当产品失败。增加隔离 Chrome profile 的真实 HTTP / DOM 点击回归：从 Goal 记录打开已迁移的引用，读取浏览器真实 clipboard API，核对精确字符串；拒绝 clipboard 权限时验证失败反馈及原剪贴板保持不变。只向测试 profile 授权，测试不操作用户 Chrome profile 或项目数据，不以 stub clipboard 证明复制成功。

该真实 Chrome 回归已通过，与 Artifact browser/project-reference/reference UI 合计 13/13 通过。正式 Goal 上下文嵌入、旧 caller 对账和独立 UI review 已完成；AR3 最终验收依据见 `ar3-embed-validation.md`，历史浏览阶段证据保留。整体开发后统一 E2E / 代码清理 / 第二次 E2E 仍按总 spec §24 执行。
