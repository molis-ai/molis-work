# UX copy

UI copy should tell people without effort: what this is, where things stand, what they can do, and what happens next. Good interface copy reads like a dependable colleague speaking plainly.

## Clarify first

- **Who is reading, and when.** First visit, mid-task rush, just hit an error, or confirming an irreversible action — each calls for different length and tone.
- **What the copy should help them do.** Understand status, make a choice, fix an error, or proceed with confidence.
- **Established terms.** Check the project's glossary and neighboring screens. Reuse existing terms rather than inventing synonyms; if an existing term is poor, flag it explicitly instead of silently renaming it.
- **Space limits.** Width of buttons, tabs, and headers — remember another language may be much longer.

## Principles

1. **Be specific.** Name what, how many, and where. "Deleted 3 items" beats "Operation succeeded".
2. **Lead with the outcome, then the reason.** "Couldn't save: connection lost" beats a paragraph of background.
3. **Start buttons with a verb that names the effect.** "Delete project" or "Send invite", not "OK" or "Confirm". In a button pair, cancel and confirm must be unmistakable at a glance.
4. **Stay consistent.** One concept, one term throughout; match verbs across buttons, menu items, and confirmation toasts ("Archive" button → "Archived").
5. **Never blame the user.** State what happened and how to proceed instead of "Invalid input" or "Illegal action".
6. **Speak human.** Keep internal identifiers, error codes, field keys, and jargon out of copy; offer copyable diagnostic IDs separately when needed.
7. **Be honest.** If something is unavailable, say why instead of "Coming soon"; label demo data clearly as demo data.
8. **Be concise without dropping essentials.** Cut pleasantries and filler; keep the object, count, and impact.

## Patterns by UI element

| Element | Must answer | How to write |
| --- | --- | --- |
| Button | What clicking does | Verb + object, 1–3 words; never "Click here" |
| Page / section heading | What this is | Noun using the product's established term |
| Empty state | Why it is empty, where to start | One plain sentence + one real action; distinguish "none yet", "no filter match", and "cleared" |
| Loading | What is happening, how long | Show only past ~1–2s; name the step for long work and offer Cancel if supported |
| Error | What happened, why, what next | Under 3 sentences; give the next step (retry, which field to edit, who to contact) and preserve input |
| Field error | Which field, what it expects | Place beside the field: "Use at least 6 characters", not just "Invalid format" |
| Destructive confirmation | What is affected, whether reversible | Name the item in the title, state the consequence in the body, and use a specific action verb ("Delete project") |
| Success toast | What changed, next option | "Archived 2 projects", with "Undo" or "View" when applicable |
| Permission request | Why needed, impact of allowing/denying | Explain purpose before asking; keep other features usable if declined |
| Unavailable state | Why disabled, how to unlock | "Connect a calendar to sync" with a direct link to connect |
| Onboarding / hint | What to do first | Teach one thing where it is used, not an opening wall of text |

## Counts, variables, and concatenation

- **Whole sentences with counts.** Put the number inside a complete localized message with proper plural forms (`1 file`, `2 files`, `No files`). Never glue fragments together or write `file(s)`.
- **Never concatenate sentence fragments.** Word order changes across languages; keep each full sentence as one message with placeholders.
- **Guard variable boundaries.** Ensure sentences still read cleanly when a name is very long, empty, or in another language.
- **Dates and times.** Follow the interface locale; use relative time for recent events ("3 min ago") and formatted dates for older ones.

## Chinese and English

Each language follows its own conventions rather than word-for-word translation. Read [references/zh-en-style.en.md](references/zh-en-style.en.md) for punctuation, spacing, casing, tone, and expansion guidelines when writing or reviewing bilingual copy.

## Deliverable format

Use a comparison table when revising copy:

| Location | Current | Suggested | Why |
| --- | --- | --- | --- |
| Delete confirmation button | OK | Delete project | Specific verb tells the user the consequence before clicking |

- Merge repeated instances of the same issue into one row listing all locations.
- For terminology alignment, end with a short glossary (preferred term, avoided terms, reason).
- When drafting a full flow, list all copy in screen order including empty, error, and post-action states.
- For bilingual copy, show Chinese and English side by side following `zh-en-style`.

## Checklist

- Every button tells you what happens when you click it;
- Every error explains the next step without blaming the user;
- Destructive confirmations name the item and its consequence;
- One concept uses one term everywhere;
- No internal IDs or raw error codes leak into copy;
- Sentences with counts read naturally for 0, 1, and many;
- No concatenated sentence halves;
- Longest variables and translated strings fit without truncating essential meaning.
