# {{name}}

## Purpose

{{summary}}

Applies to: {{applies_to}}.

## How to plan

{{steps}}

Do not turn these steps into a mechanical chain of Goals. Use them to think the problem through, then make each independently deliverable and verifiable outcome a Goal. Give each Goal one main outcome.

## Finite Goals and ongoing operations

A Goal describes a finite, verifiable change that can be completed. Establishing a capability, process or tool may be a Goal. Running it after it is established is a recurring operation; do not keep the setup Goal permanently open or use cyclic depends_on to show a business cycle.

Leave traceable facts about recurring work in notes and reports. When they reveal a real problem or improvement, propose a finite improvement through an intent or propose a Goal Tree change; the person decides whether to adopt it. Do not create or approve new Goals automatically. Reuse existing notes, reports, intents and trees; do not create a scheduler or Operation data model just to show a cycle.

## Required questions

{{coverage}}

Record unanswered key questions as decisions still needed. Do not hide them in vague Goals. A plan that omits any relevant coverage item is incomplete.

## How to decide depends_on

A dependency expresses consumption. If B cannot start or finish without an accepted output from A, write B depends_on A. The direction is always from the consumer to the provider.

{{dependencies}}

Decide each rule explicitly. Where there is real output consumption, create the hard dependency. Where work should remain parallel, do not add an edge merely to sequence it. If a rule does not apply, identify which consumption is absent; do not silently skip it.

Discussion order, dates, a shared parent, the same file or the same person are not dependencies. Use part_of for ownership. Keep work parallel where neither consumes the other's result.

Recheck the entire graph after changing dependencies: no cycles; name the upstream output and downstream use for every edge; account for prerequisites of key deliveries; start from leaf Goals with no unfinished prerequisites.

## Plan across topics

Consider all selected methods together. For every topic, list its key outputs, who consumes them and whether any consumption is a real prerequisite. When a consumer needs product definition, a user journey, market evidence, data, evaluation, a technical contract, a permissions process, research or other professional work missing from the current method set, retrieve an appropriate method before finishing the plan.

For example, market evidence can inform product decisions, product goals and journeys can constrain technical design, and implementation can consume contracts or foundational capabilities. Data and evaluation can support AI; research can support claims; roles and rights can support operations; a proven game loop can support content production. Use these as retrieval cues. Set a hard dependency only if the consumer cannot properly start or finish without the output; related, independently testable or merely aligned topics remain parallel.

## Completion evidence

{{evidence}}

## Closeout checks

{{checks}}

## Common mistakes

{{mistakes}}

## When the person changes the request

Compare it with existing Goals, confirmed outputs and the graph. Identify affected Goals and downstream consumers. Preserve valid unaffected Goals; add, change, retire or reconnect only what is affected. Check coverage, direction, cycles, omissions and executable order again. Do not rewrite the entire tree just to show you responded or silently change a confirmed goal.

## Before submitting a plan

Explain why you divided it this way, what output each depends_on consumes, which Goals can run in parallel, which leaf can run now, and what decisions still need the person.
