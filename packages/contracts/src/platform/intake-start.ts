import type { PresentationStartForm } from "./presentation-declaration.js";
import type { TextRef } from "./ui-text.js";

/**
 * Where a person can start one from nothing (contract-design §2.4): the home's and the overview's starting points read this. `open`, when
 * given, opens a form on this plugin's own stage instead of calling the action at once.
 *
 * Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract.
 */
export interface IntakeStart {
  readonly title: string;
  readonly title_text?: TextRef;
  readonly hint: string;
  readonly hint_text?: TextRef;
  /** An icon from the Host's catalog; omitted, the view's own. */
  readonly icon?: string;
  readonly open?: PresentationStartForm;
}
