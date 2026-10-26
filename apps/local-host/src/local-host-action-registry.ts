import { ActionError, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionService } from "@molis-ai/molis-work-kernel";
import type { LocalHostOptions } from "./local-host.js";
import { withSceneConfigurationActions } from "./scene-configuration-actions.js";

export type HostActionRegistryPort = Pick<ActionService, "registerProvider" | "sceneProvider">;

/** The Host binds registration and identity inspection to the same project and lifetime. No plugin receives this port. */
export function hostActionRegistry(ports: { register: ActionService["registerProvider"]; sceneProvider: ActionService["sceneProvider"] }, options: Pick<LocalHostOptions<unknown>, "admitActionProvider" | "actionProvidersChanged"> & {
  project?: LocalHostProjectReference;
  scenes(): ActionSceneClient;
  assertCurrent(): void;
  available(): boolean;
  disposers: Set<() => void>;
}): HostActionRegistryPort {
  return {
    sceneProvider: (scene, projectId) => {
      options.assertCurrent();
      if (projectId !== undefined && projectId !== (options.project?.project_id ?? null)) return undefined;
      return ports.sceneProvider(scene, options.project?.project_id);
    },
    registerProvider: registration => {
      options.assertCurrent();
      if (registration.provider.project_id && registration.provider.project_id !== options.project?.project_id) {
        throw new ActionError("actions.scope_mismatch", "能力来源不能注册到其他项目");
      }
      const bound = { ...registration.provider, ...(options.project ? { project_id: options.project.project_id } : {}) };
      options.admitActionProvider?.(bound, registration.scenes);
      const remove = ports.register({ ...withSceneConfigurationActions(registration, options.scenes()), provider: bound,
        availability: caller => !options.available()
          ? { available: false, code: "actions.host_closed", reason: "能力所在运行环境已关闭" }
          : registration.availability?.(caller) ?? { available: true },
      });
      const announce = (scenes?: typeof registration.scenes) => { try { options.actionProvidersChanged?.(bound, scenes); } catch { /* An observer never changes registration. */ } };
      const dispose = () => { remove(); options.disposers.delete(dispose); announce(); };
      options.disposers.add(dispose); announce(registration.scenes);
      return dispose;
    },
  };
}
