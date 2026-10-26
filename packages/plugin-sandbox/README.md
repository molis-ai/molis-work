# Generated plugin sandbox (macOS)

Migration goal: `goal-reorg-f2`. SSOT: `docs/SSOT-MATRIX.md`.

S0 execution foundation for `specs/archive/plugin-builder/work-items/agent-built-plugins/spec.md`.
This package does not install plugins, run the authoring agent, implement build gates,
or render generated interfaces. Those hosts must supply explicit grants and connected services.

```ts
const runner = await createSandboxRunner({
  bundlePath, contract,
  identity: { projectId, installationId, pluginId: contract.pluginId, namespace: 'preview' },
  grants, services,
});
try { const output = await runner.call('notes.list', input, { signal, beforeEffect }); }
finally { await runner.stop(); }
```

The bundle is one self-contained ESM file exporting `operations`, whose keys exactly
match the contract: `export const operations = { 'notes.list': async (input, sdk) => ... }`.
The host snapshots the bundle before execution. SDK calls are asynchronous; every call
must be awaited. Return values and thrown `{code,message}` errors cross a bounded JSON
channel. Declared errors retain their codes; unexpected errors use `sandbox.plugin_error`.
Trusted Host errors may carry `SandboxError.outcome = 'unknown'`. A service timeout or
an adapter reporting an uncertain external result fences subsequent effects and rejects
the operation even if plugin code catches the SDK error and returns a fallback. Worker
error JSON cannot supply this marker, and it does not carry into the next explicit call.

Contracts use a strict, bounded JSON Schema subset. Object schemas require `properties`,
`required`, and `additionalProperties:false`; arrays require `items`. Supported constraints
are enum/const, numeric ranges, string/array lengths, and string date/date-time/URI formats.
Unsupported schema keywords fail validation. Operations are explicitly `query` or `command`;
queries cannot declare storage/artifact/project-database writes or events. Examples require exactly one of
`output`, `outputIncludes`, or a declared `error`. The later build-gate host runs examples.

On macOS, `/usr/bin/sandbox-exec` launches the same Node executable as the trusted host,
with no inherited environment. Seatbelt denies process creation, network access, and all
file writes. Read access covers only the staged bundle/worker, Node executable, macOS
runtime libraries, entropy devices, and the root directory entry required by Node startup;
file metadata may be inspected. No workspace or application source directory is readable.
Native addons are disabled. A single stdin/stdout JSON channel carries operations and SDK
requests; stderr is discarded with a byte cap. Malformed output terminates the process.
Unsupported platforms fail closed. This profile is tested with the repository's Node 24
on macOS; application packaging must verify its bundled Node against the same tests.

Limits cover admission, in-flight SDK calls, rolling call/event budgets, channel size,
V8 heap, external resident memory, operation/startup/service wall time, and total process
CPU. CPU is a process-lifetime budget, not a per-operation allocation. The host samples RSS
and CPU every 200 ms; OS scheduling can exceed that interval. Limits terminate the process
group, reject queued calls, abort host services and clean staged files. A new instance must
be explicitly started by the lifecycle host after a crash.

Host adapters receive a frozen identity bound to the channel, an AbortSignal and a
`beforeEffect()` guard preserving the trusted Host invocation. It never enters the worker's
JSON channel. Recheck the guard after asynchronous waits and before storage commits,
nested actions and network dispatch. Operation deadlines include admission and final
authority checks after reaching the head of the queue. Cancelling queued work does not
terminate another running operation; cancelling active work terminates its channel without
replaying an operation whose external result may be unknown. Never
derive storage scope or artifact ownership from plugin payloads. `storage.transaction`
must serialize by the complete identity, give the callback a private Map snapshot, and
atomically persist only after success while the signal is active. Broker quota checks run
inside that transaction. Artifact writes need the host artifact service's own quota and
ownership checks. Capability adapters must preserve this identity when calling other
plugins. Logical resource names map to host-approved resources; never join untrusted names
to a filesystem path. Adapters must honor cancellation before committing side effects.
Missing adapters, missing effect declarations, or omitted grants deny the call.

`materials.readLocalPage` hands the Host an address as data and gets back extracted text: the Host decides (plain HTTP to a loopback
name, never its own ports, every redirect held to the same rule) and fetches; no socket, no resolved address, no header comes back. The
`original` methods keep, read and forget the file the person handed the Host's entry, by a key the plugin chooses, never a path; a
file crosses in parts of at most 256 KiB (`materials.readOriginalRange`, each part a full Host read with the first part's `revision`
passed back so a file that changes meanwhile is refused), and the SDK's `readOriginal(key, { maxBytes })` loops over the parts. Both
effects (`materials: ['fetch_local']`, `['original']`) are declared by the operation, approved by the person, and never in a query (S-65).

`ownerFiles.stat/list/read/write` reach the files the plugin's Manifest declares (`owner_files`) through the Host's
`services.ownerFiles`, the same client the Host's own plugins get (S-64). Only those four members cross: no `rootPath`,
no writer callback. A path is a relative string of at most 512 characters; the Host's port then holds it to a declared
top-level entry and refuses `..`, absolute paths, links and special nodes. A `read` is one file of at most 256 KiB
(`null` when there is none; a larger one is refused before it is read); a `list` is at most 1000 entries; a `write` is 1 to
16 steps (`mkdir`, `write`, `replace_atomic`, `copy`, `remove`, `set_access`) with base64 bytes, each file at most 256 KiB
and the call at most 512 KiB, and runs after the call's `beforeEffect()`. The operation declares `effects.ownerFiles`
(`read`, or `read` and `write`; a query cannot write) and the person approves it. The folder is the installation's own: in a
project, `<Home>/projects/<project>/plugin-files/<installation>/<store_name>/`; on the Home Runtime,
`<Home>/plugin-files/<installation>/<store_name>/` (a registered Home store, so a purge covers it). An uninstall that keeps no
data, and a reinstall that drops the data an uninstall kept, remove the installation's folder (the Host's executors, not the
plugin); an uninstall that keeps the data leaves it to the same installation id.

`projectDatabase.get/all/transaction` reach the plugin's own tables in the project's library through the
Host's `services.project_database`, adapted by `sandboxDatabase`. The broker bounds what crosses before the
adapter sees it: SQL of at most 16384 characters without NUL, at most 256 parameters that are null, finite
numbers or strings, and a transaction of 1 to 64 `{ sql, parameters }` statements. The Host's client then
checks every statement against the plugin's tables. A transaction is one Host write transaction, so a refused
statement writes none of it. BLOBs, infinities and integers past 2^53 do not cross back. The Host's refusal
codes (`plugin.project_database.*`) reach the plugin; other failures become `sandbox.database_error`.

A statement does not run on the Host's thread (S-59). Neither SQLite driver the Host has can interrupt a statement that is
running and `Worker.terminate()` cannot stop a native call, so the Host gives a sandboxed plugin `services.project_statements`
in place of `services.project_database`: the statements run in a process of their own that the Host kills with SIGKILL when
one runs past its time (`plugin.project_database.statement_timeout`) or takes the process past its memory
(`statement_memory`); the next statement starts a fresh process. `all` is read row by row and stops at the first row past
1000 rows or 512 KiB of text and numbers: `sandbox.database_result_too_large` (page with `LIMIT` and `OFFSET`). The Host's
check refuses a recursive query (a CTE that reads itself, with or without `RECURSIVE`) with
`plugin.project_database.statement_refused`. A write transaction is all of its statements or none: a killed, cancelled or
revoked one commits nothing.

`interaction.questionHtml/cardHtml/nextStepsHtml` reach the Host's `services.interaction`, which only draws html
from what the plugin passes and writes nothing, so no effect is declared or granted for it (S-56). The broker
takes objects only: a wrong argument count, a value that is not an object, or an unknown method is
`sandbox.invalid_request`, and an option counts only when it is exactly `true`. The Host checks each shape
again before drawing; without the service the call is `sandbox.service_unavailable`.

The trusted Host can pass per-call `limits.operationTimeoutMs` and `limits.serviceTimeoutMs`
from current capability metadata. They are copied when the call enters the queue and do
not mutate process defaults or another call's policy. Values must be positive timer-safe
integers. These controls never cross worker JSON and do not change grants, CPU, memory,
queue or frequency limits. The Host revalidates the selected policy in `beforeEffect()`.

`createHttpsProxy` is the package's strict network adapter. It requires exact approved DNS
domains, HTTPS port 443, and no credentials in URLs. Every DNS answer must be public
unicast; the connection pins one checked IP while retaining the original hostname for
TLS certificate validation and SNI. It never follows redirects, uses proxy environment
variables, or performs a second DNS lookup. Request/response sizes and the entire request
duration are bounded. Responses must use identity encoding. Secret references resolve
only in the trusted host, and each secret specifies its header and permitted domains.
Responses containing the secret or common URI/JSON/base64/hex encodings are rejected.
Approved upstreams necessarily receive the injected credential: approve only trusted APIs;
the scanner cannot prove absence of every possible upstream transformation of a secret.
The generated-plugin Host currently supplies its own `plugin-builder/network.ts` adapter
for preview policy and its existing fake-IP DNS allowance. That adapter also preserves
invocation guards; its address policy is distinct from this package's strict proxy.

`HttpsProxyOptions.resolveHostname(hostname, signal)` is an optional trusted-host port;
its default remains `dns.lookup(..., {all:true, verbatim:true})`. A host using a VPN with
fake-IP DNS can inject its approved DNS-over-HTTPS resolver here. Return **all** address
and family pairs, including ordinary private answers; the proxy rejects the whole set
when any address is private, malformed, or has a mismatched family. Resolver execution
shares the request deadline and AbortSignal. Checked addresses are copied before further
awaits and the connection still pins one address. This port is never exposed to plugin
code, SDK request fields, or the plugin contract. It does not authorize new destinations.

Run after building contracts and this package:

```sh
node --import tsx --test tests/plugin-sandbox.test.ts tests/plugin-sandbox-network.test.ts
```

Tests exercise real Seatbelt process isolation, successful asynchronous SDK calls and
independent queues, unauthorized calls, storage quota, malformed/oversized IPC, deadlines,
RSS termination, and process cleanup. HTTPS transport tests mock DNS/TLS transport to
verify pinning, hostname checks, redirects and secret echoes. A real public HTTPS success
requires DNS returning public addresses. A VPN's `198.18.0.0/15` fake-IP responses are
deliberately rejected rather than weakening SSRF protection.

The optional real-network test injects Agent Host's existing safe resolver without
adding an Agent Host dependency to this package. It asserts npm's ping returns HTTP 200
with a JSON response through a checked, pinned public address. Run it explicitly:

```sh
MOLIS_SANDBOX_NETWORK_E2E=1 node --import tsx --test --test-name-pattern='real registry' tests/plugin-sandbox-network.test.ts
```

For a transparent VPN with known fake-IP DNS but no proxy environment variable, add
`MOLIS_SANDBOX_NETWORK_DOH=1` to that **test** command to explicitly configure its host
resolver's existing DoH fallback. This test-only setting still preserves ordinary private
answers and validates every resulting address; it does not change production defaults.

## 开发要求

- 负责：生成插件的 macOS 进程隔离与异步宿主中介（网络、存储、项目库、能力调用、经平台的服务账号发请求、读自己手上的文件），以及宿主给这次激活建出来的服务哪些经 broker 送进沙箱（`sandboxServicesFor`），和沙箱不给的服务的启动期拒绝（`assertSandboxDeclarations`）。
- 不负责：插件产品状态、模型执行、安装流程与构建门禁。
- 公开入口：`@molis-ai/molis-work-plugin-sandbox`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin-sandbox`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（共享执行生命周期）。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 沙箱不自带能力：宿主必须显式提供授予与已连接的服务，异步中介调用必须被等待。
  - 服务经 broker 进沙箱是安装信任，不是另一套权限（S-60，PG-017）：沙箱拿到的是宿主按 Manifest 与授权为这次激活建出来的同一份服务，操作声明的效果 ∩ 人批准的授权在 broker 查，宿主服务自己的检查（Manifest 权限、授权、实例是否还在跑、动作作用域、原调用者）照旧；沙箱不给的服务，Manifest 或定义一声明，启动就被拒（`sandbox.service_not_given`），`NOT_GIVEN` 表里每一行在给它的那一片里删掉。宿主的每一项服务在 `SANDBOX_SERVICE_FATE` 里都有决定（新增服务不写决定编译不过），宿主认的权限名在 local-host 的 `HOST_SERVICE_PERMISSIONS` 一处，`tests/security-invariants-sandbox-services.test.ts` 的完整性测试要求每个名字要么被给、要么被一行拒绝。
  - 查询操作不能声明存储、成果或项目库的写入，也不能发事件。
  - 本机页面与原文件（S-65）：地址只当数据交给宿主、答复只有抽出的文字；原文件只有插件自己起的键，一段至多 256 KiB，每段是一次完整的宿主读取，版本在段间带回去；两种效果都不能出现在查询里。
  - 主人文件（`ownerFiles`，S-64）：只转 `stat`、`read`、`list`、`write` 四个成员，不转 `rootPath` 与 writer 回调；路径只许相对路径，形状与大小（256 KiB 一个文件、一次 512 KiB、16 步、列 1000 项）先在 broker 一侧查；写在 `beforeEffect()` 之后；查询不能写。
  - 项目库（`projectDatabase`）：跨通道的语句先有界再交给宿主，宿主的客户端逐句对照本插件的表；一个事务在宿主一侧整个提交或整个不写；操作声明了、人也批准了才放行。语句不在宿主的线程上执行：宿主把它们交给一个自己能杀的子进程（`services.project_statements`），超时或超内存就杀进程、答带码的错误，`get` 与 `all` 的结果字节都在 SQL Worker 中检查（超限不交给宿主），`all` 另按行数停止，递归查询不开始（S-59）。子进程控制器独立限时、测总 RSS、处理宿主断线，含提交的事务总时限是 3 秒；提交在途被中断返回结果未知。
  - 读权限只覆盖暂存的 bundle/worker、Node 可执行文件与必要系统路径；CPU 是整个进程的预算。
  - 私有存储按完整身份串行，回调拿到快照，只在成功且信号仍有效时原子落盘；适配器在提交副作用前遵守取消。
  - 一次操作发起的 SDK 服务调用，在调起这次 `call()` 当时的异步上下文里运行（`AsyncResource`），不在进程启动时的上下文里，所以宿主按调用上下文给出的东西（调用编号）跟着这次操作走；沙箱不读、不传这些值，也不依赖提供它们的包。
  - 沙箱不能直接联网，Host 必须显式装配网络适配器。`createHttpsProxy` 要求精确批准的域名、443 端口、URL 不带凭据、每个 DNS 答案必须是公网地址；fake-IP 需注入批准的 DoH 解析器。现有生成式 Host 适配器的代理策略见上文，不能把两者误写成同一实现。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-sandbox.test.ts tests/security-invariants-sandbox-owner-files.test.ts tests/security-invariants-sandbox-local-original.test.ts tests/plugin-sandbox-network.test.ts tests/security-invariants-plugin-project-database.test.ts tests/security-invariants-sandbox-services.test.ts tests/security-invariants-sandbox-connections.test.ts tests/security-invariants-sandbox-materials.test.ts tests/security-invariants-plugin-materials.test.ts tests/security-invariants-sandbox-model.test.ts tests/security-invariants-sandbox-background.test.ts tests/security-invariants-sandbox-background-host.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../skills/molis-plugin-dev/SKILL.md)、[docs/platform/PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
