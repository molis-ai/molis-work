import type { UiMountResult, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/** The one call the shell's builders need of the UiHost: mount a surface of a registered contribution where it declares it. `UiHost` has it. */
export interface UiDeclaredMountHost {
  mountDeclared<TModel>(request: UiRenderRequest<TModel>): UiMountResult;
}
