import { pluginErrors, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { declaresProjectCoordination } from './plugin-project-coordination.js';

/**
 * What a signed package that is installed in the Home may not declare (BL-628), told before anything is written so the person sees it at
 * the preview and not after an install that took itself back. Only these two are checked here; the rest of what a Home instance is refused
 * (`local_tools`, rows in a project's library, the dual-instance mark) is refused where it always was.
 *
 * - `always_on`: the plugin could not be switched off or removed in any project. A package in a project may ask the person for that; one
 *   every project shares does not, as there is no use for it yet (the person decided 2026-10-26).
 * - ports, events, 成果 and process items: they live in a project's database and under its supervisor, and a Home instance has no project
 *   (PG-025). Only the Host's own dual-instance plugins have a project half to hold them.
 */
export function assertHomePackageAllowed(manifest: PluginManifest): void {
  if (manifest.always_on === true) throw pluginErrors.declaration_invalid('装进 Home 的插件不能声明 always_on：它会在所有项目里删不掉、停不了');
  if (declaresProjectCoordination(manifest)) {
    throw pluginErrors.state_invalid('Home 级插件不给项目成果、端口和事件：需要它们的插件作双实例，由项目那一半拿这些服务（specs/dual-instance-plugins）');
  }
}
