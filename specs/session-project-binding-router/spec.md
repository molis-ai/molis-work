# Session project binding router

## Background and goal

Molis Work is installed once under `~/.molis-work`. A user may use its unified
Skill from any Runtime and Session. A newly opened Session must never silently
inherit a Molis Work project from a repository, directory, title, or other host
clue. Instead, the current Runtime may show host-provided candidate projects,
ask the user to choose, and bind only after an explicit confirmation.

The Board Goal is `MOLIS_WORK-SESSION-PROJECT-BINDING-ROUTER`.

## Current evidence

The catalog can resolve an exact `(runtime_id, stable_work_context_id)` binding
or return `unbound`. It has no suggestion state or way to remember that the
user rejected a candidate. Existing tests call reuse of the same opaque work
context ID a “new Session”; that conflicts with the intended model.

## Scope

- Treat `stable_work_context_id` as a host-owned, opaque Session/work-entry
  identity. Reusing it resumes that same host Session/process; a new Session
  must receive a new ID.
- Add a `suggested` resolution state with sorted project candidates and
  user-safe reasons. Host clues and the most recently confirmed project from
  another Session of the same Runtime change ranking only; resolving never
  writes a binding.
- Let the current Session explicitly reject a suggested project. A rejected
  candidate is not suggested again for that same Session, but remains visible
  to another Session and is never deleted.
- Expose suggestion and rejection through Runtime-context MCP tools. The model
  cannot pass Session identity or raw host clues in a tool argument.
- Update the unified `goal-advance` Skill so a Runtime asks the user to
  confirm or reject suggestions, then falls back to explicit list/create.
- Add catalog and MCP regressions for isolation, confirmation, rejection,
  switching, and schema migration.

## Non-goals

- Do not inspect Git, filesystem paths, project files, browser URLs, or model
  text to derive an identity or auto-bind a project.
- Do not create or modify any Runtime configuration.
- Do not change the behavior of an existing exact binding except to document
  that it resumes the same host Session/process.
- Do not require opening Molis Work Web.

## Design

`MolisWorkProjectCatalog` owns persistence and returns one of three states:

1. `bound`: an exact opaque host context ID already has a project binding.
2. `suggested`: the context is unbound and non-authoritative host clues rank
   one or more projects. No connection is returned.
3. `unbound`: no binding or usable candidates; Runtime asks the user to list
   or create a project.

The catalog stores per-context suggestion rejections in its own managed SQLite
database. Suggestions are generated from host-supplied clues plus the catalog's
own latest confirmed same-Runtime project history, never by scanning user data.
MCP passes host-owned clues into resolution and offers a confirmation-gated
rejection call. The Skill directs the active Runtime conversation to ask the
user before binding or rejecting.

## Module boundaries

- `src/projects/catalog.ts`: schema migration, suggestion ranking, rejection,
  and typed resolution.
- `src/mcp/server.ts`: host context wiring and Runtime-context MCP contract.
- `skills/goal-advance/`: conversation protocol and tool map.
- `README.md` and `PRODUCT.md`: public user model.
- `tests/project-catalog.test.ts` and `tests/mcp.test.ts`: behavior and
  migration evidence.

## Acceptance criteria

1. Host clues affect candidate order only. Even one high-confidence candidate
   remains `suggested`, with no binding or project DB connection.
2. A same-ID host process resume remains bound; a distinct new Session ID is
   isolated and must use suggestion/confirmation.
3. Explicit confirmation is required for binding and rejection. A rejected
   candidate is not re-prompted in that Session, is not deleted, and can still
   appear in another Session.
4. A Session’s confirmed project is sticky. Explicitly switching it changes
   only that Session’s binding.
5. Runtime MCP exposes candidate reasons, rejection, and list/create fallback
   without accepting database paths, project URLs, raw identity, or raw clues
   from the model.
6. The Skill tells every Runtime to converse with the user; Web is optional.
7. Existing catalog data migrates safely to the new schema.

## Verification

```sh
node --import tsx --test tests/project-catalog.test.ts tests/mcp.test.ts
pnpm typecheck
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/generate_openai_yaml.py skills/goal-advance --interface 'display_name=Molis Work Runtime' --interface 'short_description=让当前 Runtime 通过 MCP 连续推进一个 Molis Work 项目' --interface 'default_prompt=Use $goal-advance to connect this work to Molis Work and continue the current Runtime flow.'
python3 /Users/yijunwang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/goal-advance
pnpm test
pnpm pack --dry-run --json
git diff --check
```

## Assumptions and open questions

- The Runtime host provides a distinct opaque `stable_work_context_id` for a
  fresh Session. Molis Work cannot reliably infer that boundary itself.
- Host clue formats are intentionally lightweight and may evolve; they are
  ranking hints, not identity proof.
