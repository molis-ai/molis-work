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
try { const output = await runner.call('notes.list', input); }
finally { await runner.stop(); }
```

The bundle is one self-contained ESM file exporting `operations`, whose keys exactly
match the contract: `export const operations = { 'notes.list': async (input, sdk) => ... }`.
The host snapshots the bundle before execution. SDK calls are asynchronous; every call
must be awaited. Return values and thrown `{code,message}` errors cross a bounded JSON
channel. Declared errors retain their codes; unexpected errors use `PLUGIN_ERROR`.

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

Host adapters receive a frozen identity bound to the channel and an AbortSignal. Never
derive storage scope or artifact ownership from plugin payloads. `storage.transaction`
must serialize by the complete identity, give the callback a private Map snapshot, and
atomically persist only after success while the signal is active. Broker quota checks run
inside that transaction. Artifact writes need the host artifact service's own quota and
ownership checks. Capability adapters must preserve this identity when calling other
plugins. Logical resource names map to host-approved resources; never join untrusted names
to a filesystem path. Adapters must honor cancellation before committing side effects.
Missing adapters, missing effect declarations, or omitted grants deny the call.

`createHttpsProxy` is the production network adapter. It requires exact approved DNS
domains, HTTPS port 443, and no credentials in URLs. Every DNS answer must be public
unicast; the connection pins one checked IP while retaining the original hostname for
TLS certificate validation and SNI. It never follows redirects, uses proxy environment
variables, or performs a second DNS lookup. Request/response sizes and the entire request
duration are bounded. Responses must use identity encoding. Secret references resolve
only in the trusted host, and each secret specifies its header and permitted domains.
Responses containing the secret or common URI/JSON/base64/hex encodings are rejected.
Approved upstreams necessarily receive the injected credential: approve only trusted APIs;
the scanner cannot prove absence of every possible upstream transformation of a secret.

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
