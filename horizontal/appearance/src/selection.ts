import { isDeepStrictEqual } from "node:util";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiAppearanceApplyInput, UiAppearanceReceipt, UiAppearanceSelection, UiAppearanceUndoInput, UiAppearanceView, UiEnvironmentProblem, UiSkinFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { BASELINE_SPEC } from "@molis-ai/molis-work-design-system";
import { resolveUiEnvironment, type UiEnvironmentInput } from "@molis-ai/molis-work-plugin-sdk/ui";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { builtinAppearance } from "./builtins.js";
import { appearanceErrors } from "./errors.js";
import { createStateFile, findApplication, type AppearanceState } from "./state.js";

type Projection = { readonly selection: UiAppearanceSelection; readonly skin: UiSkinFile; readonly problems: readonly UiEnvironmentProblem[] };
type Transition = { receipt: UiAppearanceReceipt; state?: AppearanceState; effect: "applied" | "undone" };

function effective(state: AppearanceState, catalog: ReturnType<typeof builtinAppearance>): Projection {
  const chosen = catalog.resolve(state.selection);
  if (chosen.skin && chosen.problems.length === 0) return { selection: state.selection, skin: chosen.skin, problems: catalog.problems };
  const problems = [...catalog.problems, ...chosen.problems];
  const previous = catalog.resolve(state.last_recoverable);
  return previous.skin && previous.problems.length === 0
    ? { selection: state.last_recoverable, skin: previous.skin, problems }
    : { selection: catalog.baselineSelection, skin: catalog.baselineSkin, problems };
}

function nextRevision(state: AppearanceState, expected: number): number {
  if (state.selection_revision !== expected) throw appearanceErrors.revision_changed("外观已在别处更新，请读取当前选择。", { selection_revision: state.selection_revision });
  if (expected === Number.MAX_SAFE_INTEGER) throw appearanceErrors.revision_exhausted("外观修订已到上限。");
  return expected + 1;
}

function requireAvailable(catalog: ReturnType<typeof builtinAppearance>, selection: UiAppearanceSelection): void {
  const { problems } = catalog.resolve(selection);
  if (problems.length) throw appearanceErrors.selection_unavailable("这个外观组合已不可用。", { problems });
}

export function createSelection(home: string, assertOpen: () => void, changed: (revision: number) => void) {
  let stateFile: ReturnType<typeof createStateFile> | undefined;
  const file = () => stateFile ??= createStateFile(home, builtinAppearance().baselineSelection);

  function read() {
    assertOpen();
    const catalog = builtinAppearance(), stateFile = file(), seen = stateFile.read();
    if (seen.status === "current" || seen.status === "absent") {
      const state = seen.status === "current" ? seen.value : stateFile.empty;
      return { state, projection: effective(state, catalog) };
    }
    const reason = seen.status === "unreadable" ? undefined : String(seen.found);
    return { state: null, projection: { selection: catalog.baselineSelection, skin: catalog.baselineSkin,
      problems: [...catalog.problems, { code: `appearance.state_${seen.status}`, subject: "interface/state.json", ...(reason ? { detail: reason } : {}) }] } };
  }

  async function commit(caller: ActionExecutionContext, update: (state: AppearanceState, catalog: ReturnType<typeof builtinAppearance>) => Transition): Promise<UiAppearanceReceipt> {
    assertOpen();
    // Definition and resource I/O belongs outside the commit section. The checked installation is immutable.
    const catalog = builtinAppearance(), stateFile = file();
    await caller.beforeEffect();
    caller.assert_authority_current?.();
    caller.signal?.throwIfAborted();
    assertOpen();

    const before = stateFile.read();
    const { receipt, state, effect } = update(stateFile.writable(before), catalog);
    if (!state) return structuredClone(receipt);
    try { atomicWriteFileSync(stateFile.path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, durable: true }); }
    catch {
      // The error can be after rename. The exact actor, request and effect must have its receipt in the formal file.
      const after = stateFile.read();
      const intended = findApplication(state, caller.actor_id, receipt.request_id);
      const found = after.status === "current" ? findApplication(after.value, caller.actor_id, receipt.request_id) : undefined;
      if (!found || !isDeepStrictEqual(receipt, found[effect]) || !isDeepStrictEqual(intended?.choice, found.choice)) {
        const details = { request_id: receipt.request_id };
        if (isDeepStrictEqual(before, after)) throw appearanceErrors.write_failed("外观未保存。", details);
        throw new ActionError("actions.outcome_unknown", "无法确认外观是否已保存，请按原请求查询。", { details });
      }
    }
    changed(receipt.selection_revision);
    return structuredClone(receipt);
  }

  return {
    get(actor?: string, requestId?: string): UiAppearanceView {
      const { state, projection } = read();
      const found = state && actor !== undefined && requestId !== undefined ? findApplication(state, actor, requestId) : undefined;
      return structuredClone({
        selection: state?.selection ?? null, selection_revision: state?.selection_revision ?? null, effective_selection: projection.selection,
        builtins: builtinAppearance().builtins, problems: projection.problems,
        ...(found ? { recovery: { applied: found.applied, ...(found.undone ? { undone: found.undone } : {}) } } : {}),
      });
    },

    snapshot(locale: UiEnvironmentInput["locale"]) {
      const { projection: { selection, skin, problems } } = read();
      return resolveUiEnvironment({ spec: BASELINE_SPEC, skin, locale, problems,
        ...(selection.font.policy === "pinned" ? { font: selection.font.scheme } : {}),
        ...(selection.mono ? { mono: selection.mono } : {}) });
    },

    apply(input: UiAppearanceApplyInput, caller: ActionExecutionContext): Promise<UiAppearanceReceipt> {
      const { choice, expected_revision, request_id } = structuredClone(input);
      return commit(caller, (state, catalog) => {
        const found = findApplication(state, caller.actor_id, request_id);
        if (found) {
          if (found.applied.selection_revision !== expected_revision + 1 || !isDeepStrictEqual(found.choice, choice)) {
            throw appearanceErrors.request_reused("同一请求标识已经用来提交不同的外观选择。");
          }
          return { receipt: found.applied, effect: "applied" };
        }
        const revision = nextRevision(state, expected_revision);
        const selection = choice.kind === "restore" ? catalog.baselineSelection : choice.selection;
        requireAvailable(catalog, selection);
        const receipt = { request_id, selection_revision: revision, selection };
        return { receipt, effect: "applied", state: { ...state, selection_revision: revision, selection,
          last_recoverable: effective(state, catalog).selection, undo_selection: state.selection,
          applications: [...state.applications, { actor_id: caller.actor_id, choice, applied: receipt }],
        } };
      });
    },

    undo({ expected_revision, applied_request_id }: UiAppearanceUndoInput, caller: ActionExecutionContext): Promise<UiAppearanceReceipt> {
      return commit(caller, (state, catalog) => {
        const found = findApplication(state, caller.actor_id, applied_request_id);
        if (!found) throw appearanceErrors.application_missing("找不到本人的这次外观应用。");
        if (expected_revision !== found.applied.selection_revision) {
          throw appearanceErrors.revision_changed("撤销必须使用原应用的修订。", { selection_revision: state.selection_revision });
        }
        if (found.undone) return { receipt: found.undone, effect: "undone" };
        const revision = nextRevision(state, expected_revision), selection = state.undo_selection;
        if (!selection) throw appearanceErrors.selection_unavailable("找不到可撤销的原外观。");
        requireAvailable(catalog, selection);
        const receipt = { request_id: applied_request_id, selection_revision: revision, selection };
        return { receipt, effect: "undone", state: { ...state, selection_revision: revision, selection,
          last_recoverable: effective(state, catalog).selection, undo_selection: null,
          applications: state.applications.map(row => row === found ? { ...row, undone: receipt } : row),
        } };
      });
    },
  };
}
