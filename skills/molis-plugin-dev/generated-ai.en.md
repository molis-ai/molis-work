# Generated plugins: AI through Prologue

This chapter is mounted by Studio's design and code Agents. It applies the [Prologue AI Skill](../molis-prologue-ai/SKILL.md) to generated sandbox plugins. The platform supplies Runtime and the current round's language.

## Design

- State which materials the model reads, what it produces, where the result is shown or saved, and when the person confirms. Call AI from a clear command button, not an automatically refreshed query.
- Declare `model.generate` in the operation's `effects.capabilities`. Discover and call it as described by this build's `developer/capabilities.json`. Do not add provider HTTP, credential settings or hardcoded model names.
- Missing model, timeout, empty answer, invalid structure and cancellation preserve the input and previous results. Show the state and retry action. Do not present a placeholder as success.
- Check the current catalog for tools across rounds, streaming conversation or image support. `model.generate` promises one text completion; a prompt cannot create missing features.
- A generated sandbox plugin cannot ask questions and continue the same operation. It lacks Agent `ask-user` and `suggest-action`; its result goes to the part as returned, without conversion into a questionnaire. Put required object, audience, quantity or tone in the submitting part's fields. Mark required values. On missing data return a declared error naming the missing value; keep the draft for another submission. Do not ask the model to return a question or a `needs_input` continuation. Put a next step such as “Generate another” on an explicit button.

## Implementation

Declare model instructions beside the operation, not at the call site, and call by ID. People can edit the instruction in Prompt settings; installed calls use the person's edit if present.

```ts
export const prompts = [
  { id: 'summary', title: 'Extract key points', purpose: 'Turn a note into useful points for later review',
    body: 'Read the note. Extract its conclusions, decisions and tasks for later review. Keep the original terms and do not invent missing details. Return only the points, one per line.' },
] as const;

const { text } = await sdk.capability.call('model.generate', {
  prompt: 'summary',
  input: originalText,
}) as { text: string };
const summary = text.trim();
if (!summary) throw Object.assign(new Error('No text was generated; try again'), { code: 'code declared by the contract' });
```

- Say whom the step serves, what good output looks like and what to exclude. Do not copy the example for an unrelated operation. Let the content determine length and count unless the product has a real limit (e.g. a card with room for three points). State that reason and verify the returned result in code; invalid output fails even if the prompt asked for compliance.
- Every entry in `prompts` is a literal: unique lowercase letters, digits and hyphens in `id`, plus `title`, `purpose`, and `body`. The invocation's `prompt` is also a literal ID.
- Put changing data such as user input or saved records in `input`. Do not concatenate it into instructions or pass `instructions`. G4 refuses undeclared or computed IDs and obsolete `instructions` arguments.
- An installed call uses the ID and default body of that installation's release, then the person's Home override. A newer release in another project does not fill missing declarations. A live trial uses the current build's body, without applying installed defaults or edits, so an author can check the latest instructions. No project, installation or default body in business input can choose a release.

`originalText` is already validated operation input; substitute an error code that exists in the frozen contract. Get a valid result before saving it or returning the strict output shape. Check structured values and their meaning. If parsing fails, keep the original for recovery and do not write a false default success.

The call path is SDK `sdk.capability.call` → authorized sandbox Broker capability → Local Host → this Home's Prologue Runtime → model. The Host owns identity, grants, credentials, cancellation and limits. The sandbox has no `caller.beforeEffect()`; do not invent it. Native concurrent and revision-checked commits are handled by the platform; generated code must not bypass the Broker to reach the network.

Use `hostTextGeneration` for the Host's single completion; Builder Agents are for design and coding. `model.generate` still returns `{ text }`; do not assume streaming messages, structural validation or a run-record directory. Host checks current action/installation authority and cancellation before dispatch and before returning the result. Plugin code still validates its domain result before saving.

Reuse the saved request identity for retry. A fresh timestamp or random idempotency key per attempt can duplicate effects. Do not claim retries avoid duplicate charges if the platform capability does not declare idempotency.

## Verification

Model calls in automated checks and acceptance are stand-ins. They prove wiring, structure, saving and failures only. Live Studio trial can use a configured model with the build's own instructions. Distinguish it from stand-ins, which cannot validate model quality. Use the test ports in `developer/` to check declared errors and preserved input/previous results. After installation check the person's edits, the main path and recovery.

## Signed role material and methods

A signed app may declare role material and methods with no execution rights (see [authoring](authoring.md#签名-app-包的文字资料)). Host presents them as attributed, untrusted JSON. Text cannot gain `agent:run`, directories, MCP, tools or subagents, or be placed into system/role prompts or inlineMethods. Verify normal work and malicious material with a real model separately. Stand-ins prove only the delivery and refusals they exercise.
