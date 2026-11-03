# W6-01：删别名与短路由、冻结名单、AGENTS 里的装配说法（现状、依赖与分片）

T-382 路径更新：本文历史记录中的 `artifact-native-plugin-http.ts` 现为平台成果库路由 `apps/local-host/src/artifact-library-http.ts`；已移出 `NATIVE_PLUGIN_HTTP_FILES`。历史证据与当时裁定保留。

状态：第一片与 BL-081 ② 已做（2026-10-26）；第二片已做（2026-10-31，T-147，PR #1666）：构建期只剩用户批过的 Alchemist、插件创作台，门禁里改成带出处的 `APPROVED_BUILD_TIME_EXCEPTIONS`，AGENTS.md 装配一条与活文档的「冻结名单」说法改成终态。负责人：ac-coding。号段 RAC-1020～1029、BL-750～754；本片用 RAC-1020、RAC-1021，BL-750（已做，行已删）；RAC-2650～2652 由 T-147 用；RAC-1022～1029、BL-751～754 空着。

W6-01 的原文（`roadmap-2026-10-07.md` 第 92 行、`docs/system/RUNTIME-MIGRATION.md` 第 8 节）：删 `native-plugin-api.ts` 的别名和 `/api/<短名>` 路由；把 AGENTS.md 那条硬约束改写成「新的内置插件 = 自己的包 + 声明」；冻结名单为空，或只留已批准的例外。对应 PG-058（收尾）、PG-068（收尾）。

## 1. 现状（对照 main `29f1ffd47`）

| 项 | 现状 |
| --- | --- |
| `apps/local-host/src/native-plugin-api.ts` | 别名表只剩 functions 两条（`functions`、`io.molis.work.functions` → `/api/functions`）；其余短名随 `personal` 桥在 #1168 删了。生产代码里没有任何调用方打 `/api/plugins/functions…`：Functions 的客户端（`apps/workbench/src/functions/*`、Feed 规则编辑）都打 `/api/functions…`；只有 `functions-http.ts` 的一次改写、两条测试和一份预览脚本在用。**本片已删。** |
| `/api/functions…`（含 `/api/functions/settings`） | 不是插件短名：Functions 是 `modules/functions` 加宿主的 `functions-http/`（平台子系统，不在目录里）。路径不动。`/api/functions/by-key/*` 两条路由（`functions.describe`、`functions.invoke` 的 HTTP 入口）**已删**（BL-081 ②，用户 2026-10-26 弹窗决定），3 个用例改走动作入口。 |
| `apps/local-host/src/*-native-plugin-http.ts` | 四份：`alchemist`（54 行，宿主显式直连 `/api/alchemist`）、`artifact`（254 行，`/api/artifacts…`）、`feed`（92 行，`/api/feed…`）、`inbox`（66 行，`/api/inbox…`）。加通用的 `native-plugin-http.ts`（JSON 分发工具，Functions 和知识库路由也用，不是插件文件）。 |
| `tests/builtin-plugin-assembly-gate.test.ts` | `BUILD_TIME_ASSEMBLED` 六个：alchemist、artifacts、feed、goals、inbox、plugin-builder；`NATIVE_PLUGIN_HTTP_FILES` 四个（上表）；`HAND_STARTED` 一个（Files，BL-616；T-135 已删整个名单）；混合名单只剩 Coding。（2026-10-31 T-147 后：`APPROVED_BUILD_TIME_EXCEPTIONS` 两项 alchemist、plugin-builder；`NATIVE_PLUGIN_HTTP_FILES` 两项 alchemist、artifact，后者是平台成果库的路由文件；`HAND_STARTED` 已由 T-135 删。） |
| AGENTS.md 硬约束（装配一条） | 现文已经写「新的内置插件只走 Plugin Runtime…两者之外不再新增 `<插件>-native-plugin-http.ts`」，末句「现存的旧路径插件名单冻结…只许减少」要等名单变成「只剩批过的例外」才能改成终态。 |

## 2. 名单里每一项的去向

| 项 | 为什么还在 | 谁拿走 | 拿走之后 W6-01 要做的 |
| --- | --- | --- | --- |
| feed、inbox（`BUILD_TIME_ASSEMBLED`、`/api/feed`、`/api/inbox`） | 构建期装配，宿主手写 HTTP | FI-6（进 Runtime，路由写进 Manifest）、FI-7（客户端改走公开动作、删 Inbox HTTP 转发），ac-sandbox-sched | 两项从两份名单移出；两份 HTTP 文件已被那两片删掉 |
| goals | 路由已在 Manifest，Runtime 入口已建（PG-094 S10～S12）；宿主旧地址 `/api/<路径>` 的改写已删（BL-386，2026-10-29 T-043） | Goals S9～S12（PG-094），sleepy-kapitsa 一线；S9-2 等用户维护窗口 | 移出 `BUILD_TIME_ASSEMBLED` |
| artifacts（`BUILD_TIME_ASSEMBLED`、`/api/artifacts…`） | 成果库去插件身份（ac-artifacts A5、A6）：A5 换提供方要等维护时段，A6 把「成果」做成平台面并删目录条目与插件包 | ac-artifacts 线（A5 → A6） | 移出 `BUILD_TIME_ASSEMBLED`；`artifact-native-plugin-http.ts` 在 A6 里要么搬成平台的路由文件（不再以插件命名，也就不在 `NATIVE_PLUGIN_HTTP_FILES`），要么删；A6 的设计稿没写这一份文件的去向，A6 开工时要定 |
| alchemist（名单、`/api/alchemist`） | 用户 2026-10-18/10-23 定：不迁、本轮不删、绕过，以后重做（BL-376） | 用户已批的例外 | 留着，作为「批过的例外」写明出处 |
| plugin-builder（名单） | 同上（BL-377，插件创作台） | 用户已批的例外 | 同上 |
| Files（`HAND_STARTED`） | 工厂要宿主端口（BL-616） | 端口成为平台服务（PG-005、X-5） | 不属 W6-01，名单本来就只许减少；T-135 已做（Files 改写 `project_runtime`） |

## 3. 分片

- **第一片（已做）**：删 `native-plugin-api.ts`；`functions-http.ts` 直接用原 URL；`index.ts` 去掉两个导出；`tests/personal-plugins-review-fixes.test.ts` 的改写断言换成「旧前缀不再进 Functions 的 handler」；`tests/functions-authoring-actions.test.ts`、同一文件里的 HTTP 用例和预览脚本改打 `/api/functions`；PG-058、BL-081、RUNTIME-MIGRATION 与 action-architecture 两份文档里的旧说法改正。没有动作、合同、Manifest 变化，不涉及安全边界。
- **第二片（等第 2 节的三条线，BL-750）**：① `BUILD_TIME_ASSEMBLED` 收到 alchemist、plugin-builder，`NATIVE_PLUGIN_HTTP_FILES` 收到 alchemist；两个例外在测试里带上出处（用户日期、BL 号），不再是「冻结名单」而是「批过的例外」，其余 id 出现就失败；② AGENTS.md 装配一条改写成终态：新的内置插件 = 自己的包 + `registration` 声明，没有第二条路；旧路径只剩两个批过的例外，出处写明；③ 同步改 `docs/platform/LOCAL-HOST.md`、`docs/platform/PLUGIN-DEVELOPMENT.md`、`docs/system/EXTENSION-POINTS.md`（第 13 项）、`docs/system/RUNTIME-MIGRATION.md`、`skills/molis-plugin-dev/host.md` 里的「冻结名单」说法。②③ 里改门禁的断言写法按「改门禁先报统筹」，先交写法再动。已做（2026-10-31，T-147）。`artifact-native-plugin-http.ts` 没有收：#1552 没改它的名字，改名归 BL-926。

## 4. 要统筹或用户裁定的

1. 第二片的先后：它必须排在 FI-6/FI-7、Goals S9、ac-artifacts A6 之后。统筹要不要把名单终态的断言改成「现在就写成例外表（带出处），其余项各自带 owner 与线名」，让每条线移出自己的 id 时顺手缩短，而不是最后一次性收？（改门禁，先报统筹。）
2. （已裁，2026-10-26）`/api/functions/by-key/*`：用户弹窗定删，已做（本片）。
3. `artifact-native-plugin-http.ts` 在 A6 之后的去向（见第 2 节）：统筹裁定由 ac-artifacts 在 A6 开工时的设计稿里定，第二片等它。结果：#1552 留下了这个文件、只改内容；统筹 2026-10-30 裁：`artifact` 留在 `NATIVE_PLUGIN_HTTP_FILES`，理由写「平台自己的成果库路由，不是哪个插件的」，RAC-2651 保证没有插件能借它藏身，改名另记 BL-926。

统筹 2026-10-26 对第 1 项的裁定：维持现状，不改成例外表；冻结名单已要求「删掉的条目同时移出名单」，各线删自己的 id 时在自己的 PR 里缩短；第二片放最后，一次改完 AGENTS.md 终态写法和几份文档。

## 5. 验收

| 编号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-1020 | `apps/local-host/src/native-plugin-api.ts` 不存在；Functions 只在 `/api/functions…` 回答，`/api/plugins/functions`、`/api/plugins/io.molis.work.functions`、`/api/plugins/functions/<id>` 都是 404 且不列出任何判断；Functions 的 HTTP 用例走 `/api/functions…`，断言不变 | `tests/personal-plugins-review-fixes.test.ts`（「Functions 只在 /api/functions…」），`tests/functions-authoring-actions.test.ts` |
| RAC-1021 | `/api/functions/by-key/<key>`（GET）与 `/api/functions/by-key/<key>/invoke`（POST）不再有路由（路由表返回空，请求落到宿主目录模式的通用 API 拒绝（HTTP 400，不接受内部错误），不调用任何动作，也不跑判断）；按函数键读取和调用只走 `functions.describe`、`functions.invoke` 动作；原先用这两条路由的 3 个用例改走动作入口，断言的意思不变（调用一次、数据同值、读取不动 Keychain、草稿看不见） | `tests/functions-plugin.test.ts`（「invoke by key goes through the Functions actions…」），`tests/system-functions-actions.test.ts`，`tests/secret-store-keychain-retry.test.ts` |
| RAC-2650 | 目录里不由监督器（项目的 `project_runtime` 或 Home 的 `runtime`）启动的条目，排序后正好是 `APPROVED_BUILD_TIME_EXCEPTIONS` 的键 `alchemist`、`plugin-builder`：多一个构建期插件、少一个例外、例外被迁到 Runtime，都红；每个例外的出处有 `user 20xx-xx-xx` 日期和一个 `BL-` 号，那一行在 `specs/BACKLOG.md` 里还开着 | `tests/builtin-plugin-assembly-gate.test.ts` 的 `RAC-2650 …`；变异 M1～M4 |
| RAC-2651 | `apps/local-host/src` 里每个 `<名>-native-plugin-http.ts`，名字（或加 `s`）是目录里的内置插件的，那个插件必须是批过的例外；`NATIVE_PLUGIN_HTTP_FILES` 每项写了不少于 20 字的理由 | 同一文件的 `RAC-2651 …`；变异 M6 |
| RAC-2652 | `AGENTS.md` 装配一条的末句是终态写法；活文档（`AGENTS.md`、`apps/workbench/README.md`、`docs/platform`、`docs/system`、`skills`）里不再有冻结名单的说法，只剩三处：`RUNTIME-MIGRATION.md` 的 `:47`（2026-10-18 的名单记述，行尾已加注）与 `:179`（Form 迁移的历史步骤），以及 `GLOSSARY.md:142`（T-316 锁着该文件，合入后再改） | 命令输出贴进 T-147 的交接，不进测试（命令见任务书第 6 节） |
