---
name: "Game design"
summary: "Close a playable loop across core play, systems, content, player journey and feedback."
applies_to: ["Game design", "Gameplay systems", "Game content"]
---

# Game design

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
