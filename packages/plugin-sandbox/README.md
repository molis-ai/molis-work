# Generated plugin sandbox (macOS)

Status: `partial`. Contract: `@molis-ai/molis-work-contracts/platform/plugin-sandbox`.
Migration goal: `goal-reorg-f2`. SSOT: `docs/SSOT-MATRIX.md`.

S0 execution foundation for `specs/plugin-builder/work-items/agent-built-plugins/spec.md`.
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
channel. Declared errors retain their codes; unexpected errors use `PLUGIN_ERROR`.
Trusted Host errors may carry `SandboxError.outcome = 'unknown'`. A service timeout or
an adapter reporting an uncertain external result fences subsequent effects and rejects
the operation even if plugin code catches the SDK error and returns a fallback. Worker
error JSON cannot supply this marker, and it does not carry into the next explicit call.

Contracts use a strict, bounded JSON Schema subset. Object schemas require `properties`,
`required`, and `additionalProperties:false`; arrays require `items`. Supported constraints
are enum/const, numeric ranges, string/array lengths, and string date/date-time/URI formats.
Unsupported schema keywords fail validation. Operations are explicitly `query` or `command`;
queries cannot declare storage/artifact writes or events. Examples require exactly one of
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

- 负责：生成插件的 macOS 进程隔离与异步宿主中介（网络、存储、能力调用）。
- 不负责：插件产品状态、模型执行、安装流程与构建门禁。
- 公开入口：`@molis-ai/molis-work-plugin-sandbox`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin-sandbox`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-kernel`（共享执行生命周期）。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 沙箱不自带能力：宿主必须显式提供授予与已连接的服务，异步中介调用必须被等待。
  - 查询操作不能声明存储或成果写入、也不能发事件。
  - 读权限只覆盖暂存的 bundle/worker、Node 可执行文件与必要系统路径；CPU 是整个进程的预算。
  - 私有存储按完整身份串行，回调拿到快照，只在成功且信号仍有效时原子落盘；适配器在提交副作用前遵守取消。
  - 沙箱不能直接联网，Host 必须显式装配网络适配器。`createHttpsProxy` 要求精确批准的域名、443 端口、URL 不带凭据、每个 DNS 答案必须是公网地址；fake-IP 需注入批准的 DoH 解析器。现有生成式 Host 适配器的代理策略见上文，不能把两者误写成同一实现。
- 改动后必跑：`node scripts/run-tests.mjs tests/plugin-sandbox.test.ts tests/plugin-sandbox-network.test.ts`
- 相关手册：[skills/molis-plugin-dev/SKILL.md](../../skills/molis-plugin-dev/SKILL.md)、[docs/platform/PLUGIN-PLATFORM.md](../../docs/platform/PLUGIN-PLATFORM.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
