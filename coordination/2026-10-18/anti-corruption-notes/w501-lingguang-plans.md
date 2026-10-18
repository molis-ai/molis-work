# W5-01 灵光的两个前置平台小片（方案，2026-10-17）

用户 10-17 弹窗定：材料读取照现状归平台（先问的一次前提写错了，已更正重问）。

## (a) Runtime 路由的流式回复

**合同**
- `PluginRouteDeclaration` 加 `stream?: "ndjson"`。只有声明了的路由能流；没声明的照旧一次性回复。
- 插件一侧：`PluginRouteRequest` 多一个 `emit?(line)`，只在声明了流的路由上出现。处理器照旧返回 `PluginRouteResponse`。宿主写在流的最后一行：成功是 `{type:"result", result: body}`，失败是 `{type:"error", status, code, message}`。
- SDK 的 `bindPluginActionRoute` 把动作的 `on_progress` 接到 `emit`，灵光就不用自己写流。Manifest 检查：`stream` 只许出现在 POST 上。

**宿主**（`plugin-route-operations.ts` 一处，Home 与项目共用）
- 先读完请求体，再写 200 和 `application/x-ndjson`、`no-store`、`nosniff`。读体失败照旧回 413 或 400 的 JSON，不开流。
- 每行一个 JSON。`emit` 在响应关闭后不再写。

**三件事**
1. **36 MB 与 `max_body_bytes`**：SDK 现在给声明的上限封顶 12 MiB（`MAX_ROUTE_BODY_BYTES`）。灵光上传 25 MB 的文件，base64 之后约 33.4 MB，所以今天的宿主原生路径给的是 36,000,000。可选的做法：
   - ① 封顶提到 36,000,000，只对声明了的路由，默认值不变，S-03 同步改；
   - ② 封顶不动，上传改成原始字节，不用 base64。可 25 MB 仍超过 12 MiB，要么封顶仍要提，要么把灵光的文件上限降到 12 MiB，后者是功能回退。
   - **用户 10-17 弹窗定 ①**（原话「封顶提到 36,000,000（推荐）」）：只对显式声明的路由生效，默认值不变；S-03 同步改，并加多一字节答 413 的拒绝用例。
   顺带一个现存的不一致：合同注释写的是没声明时用宿主默认的 256,000 B，Home 路由实际是 12 MiB（W3-06-F-02 测的就是这个）。这一片把注释改成实际的值，不改行为。
2. **流到一半出错**：写一行 `{type:"error", status, code, message}`，再结束响应。状态码已经是 200，改不了，所以错误只在这一行里。客户端以最后一行为准：`result` 是成功，`error` 是失败，没有最后一行就是中断（照灵光现在的写法）。
3. **撤权、停用、取消**：都要立刻断。宿主给每次请求一个 `AbortController`，`signal` 交进 `execution`：响应关闭、插件停用（监督器换代）、撤权都触发它。断开之后先写一行 `{type:"error", code:"actions.cancelled"}` 再结束（连接还在时）；动作那边由 `beforeEffect` 拒绝写入，照 W3-06 的取消语义，不写业务记录。用例三条：等待中停用、等待中撤权、客户端断开，都断开流且不写记录。

**用例**：`tests/plugin-route-stream.test.ts`，用 Home 夹具插件，覆盖成功、中途出错、三种中断、没声明的路由不能流、读体 413 不开流。S-03 一行改措辞并登记新用例。

## (b) `services.materials`：把平台现有的提取口交给 Runtime 插件

**现状**：合同 `contracts/services/materials` 写明抽取吃已授权的字节、归宿主；`material-extraction.ts` 是共同提取口，Shelf、Artifacts、项目上手直接用。Jelly 外面那层（`jelly-native-material.ts`）只多做三件事：base64 上传检查、模型缓存目录、把 `material.*` 改名成 `jelly.material.*`。读网页的 `jelly-source-reader.ts` 与 `jelly-source-providers.ts`（S-10 五处地址校验之一，加上按来源分的解析器）也是 Jelly 前缀。

**合同**
- `PluginHostServices.materials?: PluginMaterialsClient`，有 `extract(source, options)`（吃字节，不吃路径）与 `readSource(url, options)`。
- Manifest 声明 `materials:read` 权限才给。只给宿主自己跑的插件（和 `services.model` 同一条规则），外部插件没有。
- 每次调用都带调用方的 `signal` 与 `beforeEffect`。模型下载要人同意，照旧是 `allow_model_download`，由调用方从人的选择传进来。

**改名与归属**
- `jelly-source-reader.ts` → `material-source-reader.ts`，`jelly-source-providers.ts` → `material-source-providers.ts`，函数去掉 `Jelly` 前缀。S-10 的文件名、S-13 里写的「Jelly 的材料」同步改，相关用例文件一起改名。
- 错误码：灵光改认平台的 `material.model_required` 与 `material.native_unavailable`，不再认 `jelly.material.*`（`client.ts:174`）。Jelly 自己的路由照旧改名带出 `jelly.material.*`，它的客户端不动。
- 上传检查（文件名、扩展名、base64 形状、25 MB）只写一份：搬进插件 SDK（`decodeMaterialUpload`，和 AGENTS.md 里作者与平台共用、会运行的工具一样放在 SDK），Jelly 与灵光都从 SDK 取，不各写一份，灵光也不 import Jelly。错误码用 `material.*`，Jelly 照旧在自己的路由上改名。
- **模型缓存目录**：现在是 `{home}/lingguang/models`。名字是灵光的，内容是平台的。这一片不搬，以免真实 Home 多一步维护：路径照旧，只在 `HOME-DATA.md` 记归平台，搬目录另开一行待办。

**这一片不做**：灵光本身的迁移（第三片才做，有了 (a) 与 (b) 才迁）。

## 排期
(a) 与 (b) 互不依赖，各是一个 PR，受本线最多两片在途的限制，排在 W5-01 Todo 与 §10.26 之后。

## 统筹 10-17 补的五条（已认可两份方案）

1. **`emit` 只交载荷**：插件交 `emit(payload)`，宿主包成 `{type:"progress", ...payload}`，并去掉载荷里的 `type` 键；`result` 与 `error` 两种行只由宿主写。单行上限 64 KiB、总行数上限 10,000（数值写进合同），超了就以 `{type:"error", code:"actions.output_invalid"}` 结束并断开（用现有的平台码，不新加）；配拒绝用例（插件想写 `type:"result"` 的行，客户端拿到的仍是 progress；超长行、超行数都以 error 结束）。
2. **头与读取**：流式回复的头和 JSON 路由相同（`no-store`、`nosniff`），Content-Type 是 `application/x-ndjson; charset=utf-8`。客户端读 ndjson、以最后一行判定的代码只写一份，放进插件 SDK（`readPluginRouteStream(response, onProgress)`，返回 result 或抛出 error），灵光的客户端从 SDK 取。
3. **两个权限**：`materials:read`（`extract`，本机字节）与 `materials:fetch`（`readSource`，向外取公开链接）分开声明，只声明 read 的插件拿不到 `readSource`。
4. **下载模型的同意只在人发起时算数**：调用方是 Agent 或 MCP 时，`allow_model_download` 一律按 false 处理，答 `material.model_required`。来源取调用上下文的 `caller.audience`（`user | agent | workflow | mcp | plugin`），只有 `user` 算数，workflow 与 plugin 也按 false；不从输入读。写进 SECURITY-INVARIANTS 新的一行，配拒绝用例：Agent 调用带 true 也不下载。灵光现在从输入读这个值，这次收口。
5. **全量与合同**：两片都改 SDK（`emit`、ndjson 读取、`decodeMaterialUpload`），按共享核心跑全量（由统筹在 CI 上排）。合同变了（Manifest 的 `stream`、两个权限、`PluginHostServices.materials`），跑 `pnpm api:update`，影响写进 PR 正文。

## 写代码前查出的一处缺口（(a) 的「停用即断」）

监督器现在只通知「插件起来了」（`observeActivation`），没有「停了」的通知；实例只有 `active()` 可查，没有会触发的 signal。所以等模型、不出进度的流，在停用时不会自己断。做法：
- 监督器加 `observeDeactivation(listener)`，在 `revoke`、停止、隔离、失败时通知。宿主在流开着时订阅这个插件，收到就中止这次请求的 controller。
- 撤销路由声明的会话权限：每次 `emit` 前、`beforeEffect` 时由 `assert_authority_current` 拒绝。撤的是插件的必需授权时，监督器本来就会停用它，走上面同一条通知。
- 用例照方案里的三条：等待中停用（不出进度也立刻断）、等待中撤权、客户端断开。

## 要写进 spec 决策记录的经过

材料读取的归属问了两次：第一次我把前提写错了（说成「是 Jelly 的代码」），用户选了「归 Jelly」；统筹指出 main 上的事实后，我更正前提重问，用户选了「照现状归平台（推荐）」。正文上限：用户选「封顶提到 36,000,000（推荐）」。

## 统筹 10-17 再补两点（已认可）

1. **progress 行另有总字节上限 1 MiB**（1,048,576 B，所有 progress 行合计）；单行 64 KiB、10,000 行照旧。`result` 行不受单行上限，照动作现有的输出上限走，合同里写明，免得 36 MB 文件抽出的正文被截掉。超任一上限以 `actions.output_invalid` 结束。
2. **`observeDeactivation` 也覆盖换代**（升级、重装、回滚）。流结束后（`finally`）取消订阅；用例：连开 N 个流，结束后这个插件的监听数回到 0（监督器给测试一个只读的计数）。

## 写法上的一处：进度怎样从路由到动作

`BoundActionClient.invoke(definition, input, control)` 的 `control` 只取四项（signal、beforeEffect、page_context、assert_authority_current），没有 `on_progress`。如果 `bindPluginActionRoute` 把路由的 control 展开成新对象再加 `on_progress`，#679 按对象身份认宿主签发的 control（WeakMap），项目就丢了，调用会在没有项目的情况下跑。所以不展开：`invoke` 加第四个参数 `transport?: { on_progress? }`，只带进度，不带任何身份或授权；`bindPluginActionRoute` 在路由有 `emit` 时传 `{ on_progress: event => request.emit(event) }`。宿主的动作客户端（`plugin-actions-client.ts`）把它并进调用上下文的 `on_progress`。用例钉住：带项目前缀的流式路由，进度能到客户端，动作看到的仍是页面所在的项目。
