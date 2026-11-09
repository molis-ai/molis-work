# Capabilities: read, write and irreversible

The unified action service (`ActionService`) is the only directory of system capabilities, installed plugins' actions, MCP and connectors. Do not create a second capability table or tool list for a plugin.

## Three fields describe each action

| Field | Meaning |
|---|---|
| `audiences` | Who can see and call it: `user`, `agent`, `workflow`, `mcp`, `plugin`. |
| `effect` | What the invocation changes: `read` is read-only, `write` changes something that can be reversed, and `irreversible` cannot be undone. |
| `plugin: false` | Do not offer it to generated plugins, even if it is available to an agent. |

When there is no explicit effect, a query or navigation is read-only. A capability ID containing a verb segment such as delete, trash, purge, destroy, erase, wipe, reset, uninstall or remove is inferred to be irreversible; other actions are inferred to write. If the name sounds destructive but the action is reversible (removing a tag, a pre-delete preview or moving to a recoverable trash), declare it with `withActionEffect(definition, "write")`. If the earlier inference was what kept it out of generated plugins, also write `plugin: false` to keep it unavailable.

An action with the `agent` audience is also offered to generated plugins, except if it is irreversible or specifies `plugin: false`. Irreversible actions are never offered to plugins.

## First-party plugins

- Register new actions in the shared directory. UI, workflows, agents and MCP use the same handler. Define the action with SDK `defineAction`; see the [SDK guide](../../packages/plugin-sdk/README.md) and step 12 of [Host wiring](host.md).
- Declare the `effect` for actions that change data. Use `plugin: false` or omit the `agent` audience for actions that should not be automated.
- Complete the input and output schemas. Generated plugins, agents and MCP all use them to call and validate; a field absent from the schema is unavailable to those callers.
- Read trusted actor, project and installation identity from the context, never business input.
- A write credited to a Runtime session declares `authorship: "session"`. MCP calls must carry a stable session; read authorship from `caller.audit_actor_id`.
- Handlers that wait for a model or another service declare `scheduling: "concurrent"`. After the wait, `await caller.beforeEffect()` and commit against the version originally read.
- Validate reads and writes against the current strict contract. Maintenance updates existing data; the schema does not accept historical values. Invalid query output is `actions.output_invalid`. When a command already committed, invalid output is `actions.output_invalid_after_effect`; callers refresh instead of repeating the write.

## Generated plugins

- Use only directory capabilities approved at installation. Installation grants the reads; it lists writes individually. Irreversible actions do not appear.
- A design can use a plugin the catalog marks not yet enabled. The platform asks for approval before build. If the person declines, the lead designer revises without it. Prefer an enabled provider that can do the same job.
- In trial and acceptance, all foreign writes return a valid stand-in matching the output schema; they do not touch real data. Only installed plugins make those real calls. Examples and acceptance assert structures or data the plugin itself retains, not another owner's live results.
- Reads in examples also return stand-in data; assert a subset rather than an exact result. The stand-in creates one list record, strings are `示例`, numbers use their minimum and enums use their first value.
- Keep paid or quota-limited calls, such as models, behind a user-triggered operation. Never put them in a query that automatically runs when a page opens.

## Invocation identity and limits

A generated plugin calls as itself (`plugin:<plugin id>`), identified by plugin name in history. The Host rechecks that the installation is current and that grants have not been withdrawn before each call. Calls have rate and duration limits; models also have a per-minute limit.

Published `contract.operations` register once as public actions; do not maintain a separate MCP or action list. The Host refreshes public `execution.cost` from each operation's effects and its real dependencies before discovery and invocation, including indirect cost through other generated plugins. Unknown networks or dependencies and unresolved cycles cannot be recorded as free. A cost declaration neither measures usage nor grants authority. Sandbox queueing, per-install rate and public caller limits have different meanings; do not copy values between them. Retain old action provider/version and the installation Manifest fingerprint. A new release still needs the corresponding external authorization.

## Bounded model calls and cancellation

Use the [Prologue AI Skill](../molis-prologue-ai/SKILL.md). Business code takes only the port the Host provides; the Host uses `hostTextGeneration` for structured output, progress and receipts. Coding's short drafting and Cognia's knowledge generation use the same Home Runtime. Do not copy adapter construction from tests into a button handler.

A Host Capability call can narrow execution with `{ signal, before_effect }`. The SDK preserves the signal; the Host exposes it in the invocation and keeps checking the original identity. These options cannot override `plugin_caller`. After any external wait, still check the business revision and permission to commit. Progress is not a verified result. Unreported usage is not zero.

For cancellation, deadlines and repeated ownership checks within one process, use SDK `createExecutionLifetime`. A synchronous error from `monitor.check()` cancels the operation. Pass its signal to the external wait, call `assertActive()` before the business transaction or compare-and-set, and dispose in `finally`. A lifetime grants no permission, does not replace `beforeEffect`, and owns neither durable state nor retry policy. Alchemist's lease renewal and Images' cancellation monitor are real examples. Cancellation, closure and lost leases do not become ordinary failures. Never replay a paid request whose outcome is unknown.

### Make action results readable

Declare `action.result_view` beside the action. `summary` states the actual business result; `title_pointer` and `text_pointer` read the original result's title and text using JSON Pointers. `link: { label, href_template }` points to the original object on this site. The template replaces only `{project_id}` and `{/output/field}`; each substituted value is URL-encoded separately. The [public SDK guide](../../packages/plugin-sdk/README.md#展示动作结果) describes examples, long results, history and missing values. Do not change a business result for the UI or create Host branches for individual plugin IDs.
