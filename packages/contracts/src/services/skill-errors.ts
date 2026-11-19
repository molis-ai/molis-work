import { defineErrorCodes } from "../platform/actions.js";

/**
 * The refusals of the Skill actions, declared once. A reference no longer current, off, not named, or unavailable is `read_refused`
 * with `details.reason` a `SkillReadRefusal`; `skills.body.read` answers the same reasons item by item instead of refusing the call.
 */
export const skillErrors = defineErrorCodes("skills", {
  /** No Skill of this installation and id in this scope's catalog. */
  not_found: "not_found",
  read_refused: "forbidden",
  /** The path is not one the Skill's declaration lists. */
  resource_undeclared: "not_found",
  /** `expected_revision` is not the current settings revision. */
  settings_conflict: "conflict",
  /** The Skill is unavailable for a reason in `SKILL_SETTINGS_LOCKED_REASONS` (`details.reason`). */
  settings_locked: "conflict",
  /** `home` named for a Skill installed in a project: it can only be enabled in that project. */
  scope_mismatch: "invalid",
  /** The Runtime has no Skills folder here, or the directory is not granted to this project. */
  import_source_unavailable: "not_found",
  /** The preview is unknown, used, or not this person's. */
  import_preview_unknown: "not_found",
  /** A `skill_ids` entry is not an importable candidate of the preview. */
  import_skill_unknown: "invalid",
  /** The confirmation's `applies_to` misses a chosen Skill that writes none, names one that writes its own or is not chosen, or repeats one. */
  import_applies_to_invalid: "invalid",
  /** `skill_id` is not one of the person's own Skills in this scope, or the reference is not in the catalog. */
  authored_unknown: "not_found",
  /** `expected_version` is not the Skill's current version (`details.version`). */
  authored_conflict: "conflict",
  /** Another of the person's own Skills in this scope has this name. */
  authored_name_taken: "conflict",
  /** A field is empty or over its limit, or `skill_id` came without `expected_version` (`details.field`). */
  authored_invalid: "invalid",
  /** This scope's package is full (`SKILL_LIMITS.skillsPerPackage`). */
  authored_full: "conflict",
  /** The model answered with something that is not a draft. */
  draft_unreadable: "upstream",
  /** No draft of this id in a scope this call can see, or it was discarded and is no longer kept. */
  draft_unknown: "not_found",
  /** `expected_revision` is not the draft's current revision (`details.revision`). */
  draft_conflict: "conflict",
  /** This draft is being adopted; its fields, known answers and replay evidence cannot change until that attempt settles. */
  draft_adopting: "conflict",
  /** The Assistant replays or takes back only a draft it opened in the same piece of work; the person's own drafts are theirs. */
  draft_refused: "forbidden",
  /** The draft has known answers and this revision was not replayed: replay before adopting. */
  trial_required: "conflict",
  /** The latest replay differs from the known answer and `accept_differences` was not given. */
  trial_differs: "conflict",
  /** A known answer is empty or over its limit, the draft has `SKILL_CASES_MAX` already, or `case_id` is not the draft's (`details.field`). */
  case_invalid: "invalid",
});
