# Game design

Close a playable loop across core play, systems, content, player journey and feedback.

For: Game design, Gameplay systems, Game content.

## Planning path

1. Define fantasy, player motivation and core loop
2. Set system rules and content supply
3. Design journey and feedback
4. Build a playable slice and test pacing and balance

## Required coverage

| area | label | question |
| --- | --- | --- |
| core_gameplay | Core play | What does the player repeatedly do and why continue? |
| game_systems_content | Systems and content | How do rules, resources and content support the loop? |
| player_journey | Player journey | How do learning, growth, challenge and long-term goals unfold? |
| interaction_ui | Interaction and UI | How do controls, feedback and information keep it playable? |
| audiovisual | Art and sound | How do they signal state and reinforce emotion? |

## Dependency rules

| rule_id | statement | direction_hint |
| --- | --- | --- |
| systems-after-loop-intent | Rules and content supply need a clear motivation and loop hypothesis. | systems depend_on core loop intent |
| production-after-loop | Large-scale content and audiovisual production needs a proven playable loop. | production depends_on playable loop |

## Completion evidence

- Playable slice
- Observed player behavior
- Rules and tuning checks

## Closeout checks

- Core loop is actually playable
- Systems and content serve the same experience

## Common mistakes

- Building lore without a loop
- Making lots of content first
- Dividing by technical layer rather than experience outcome

## How to use this method

- Think the work through along the planning path first, then list each result that can be delivered and accepted on its own as one item; do not mix several main results into one.
- Every required-coverage question that bears on the task needs an answer; a key question without one is listed as open, not hidden behind a vague item.
- A dependency means consuming a result: B depends on A only when B cannot start or finish without A's accepted output. Order of discussion, timing, the same owner or the same file are not dependencies; work with no such relation stays parallel. Judge each dependency rule, and say which output is missing when one does not apply.
- State for each item what proves it is done (completion evidence), and run the closeout checks before finishing.
- Describe finite changes that can be completed; ongoing operation is not an item that never ends.
- When used with other planning methods, put their key results side by side, see which consumes which, and bring in the method that provides anything missing.
- Show the breakdown to the person first. When they want it in a tool (for example an installed Goals plugin), write it with that tool's own actions, with their confirmation.
