import { pluginErrors, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { declaresProjectCoordination } from './plugin-project-coordination.js';

/**
 * What a signed package that is installed in the Home may not declare (BL-628), told before anything is written so the person sees it at
 * the preview and not after an install that took itself back. Only this is checked here; the rest of what a Home instance is refused
 * (`local_tools`, rows in a project's library, the dual-instance mark) is refused where it always was.
 *
 * - ports, events, 成果 and process items: they live in a project's database and under its supervisor, and a Home instance has no project
 *   (PG-025). Only the Host's own dual-instance plugins have a project half to hold them.
 */
export function assertHomePackageAllowed(manifest: PluginManifest): void {
  if (declaresProjectCoordination(manifest) && manifest.runtime?.dual_instance !== true) {
    throw pluginErrors.state_invalid('Home 级插件不给项目成果、端口和事件：需要它们的插件作双实例，由项目那一半拿这些服务（specs/archive/dual-instance-plugins）');
  }
}
