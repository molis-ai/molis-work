import { IMAGE_GENERATION_ROLES, imageGenerationRoleOf, type ActionCallContext, type ActionView, type ImageGenerationRole } from '@molis-ai/molis-work-contracts/platform/actions';
import type { ensureInstalledPlugins } from '../installed-plugin-host.js';
import type { AgentBuilderPorts, AgentStudioOptions, Studio } from './agent-surface.js';

type ImageRoles = Record<ImageGenerationRole, ActionView>;

/**
 * The project's image generator, found by role (Role 6, `IMAGE_GENERATION_PROTOCOL`): the first provider that declares all four roles.
 * The platform names no image plugin; the permissions the person's call carries are the ones those four actions declare.
 */
export function imageGeneratorOf(views: readonly ActionView[]): { roles: ImageRoles; permissions: string[] } | undefined {
  const byProvider = new Map<string, Partial<ImageRoles>>();
  for (const view of views) {
    const role = imageGenerationRoleOf(view.action);
    if (!role) continue;
    const group = byProvider.get(view.provider.provider_id) ?? {};
    group[role] ??= view;
    byProvider.set(view.provider.provider_id, group);
  }
  for (const group of byProvider.values()) {
    if (!IMAGE_GENERATION_ROLES.every(role => group[role])) continue;
    const roles = group as ImageRoles;
    return { roles, permissions: [...new Set(IMAGE_GENERATION_ROLES.flatMap(role => roles[role].action.permissions))] };
  }
  return undefined;
}

/** What the studio draws proposals with: the project's image generator, through its own actions and as the person, when an image service is set up. */
export function studioImages(options: AgentStudioOptions, actions: Awaited<ReturnType<typeof ensureInstalledPlugins>>['actions']) {
  const person = (permissions: readonly string[]): ActionCallContext => ({ actor_id: options.actorId ?? 'web-user', project_id: actions.project_id, audience: 'user', permissions: [...permissions] });
  // W7: pictures of proposals through the generator's own actions, as the person, when an image service is set up.
  const imageAction = async <T,>(role: ImageGenerationRole, input: unknown): Promise<T> => {
    const found = imageGeneratorOf(options.actions?.inspect ? await options.actions.inspect(person([])) : []);
    if (!found) throw new Error('这个项目里没有图片功能');
    const view = found.roles[role];
    return await actions.client.invoke(person(found.permissions), { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input) as T;
  };
  const imageService = async () => (await imageAction<{ connections: Array<{ id: string; available?: boolean }> }>('services.list', {})).connections.find(item => item.available !== false);
  const images: NonNullable<AgentBuilderPorts['mockups']> = {
    available: async () => Boolean(await imageService().catch(() => undefined)),
    async draw(request, signal) {
      const service = await imageService();
      if (!service) return { reason: '没有可用的生图服务' };
      let { job } = await imageAction<{ job: { id: string; status: string; images: Array<{ id: string }>; error: string } }>('generate',
        { request_id: 'builder-' + request.key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120), connection_id: service.id, prompt: request.prompt });
      // One request; waiting is only reading its state, never asking the service again.
      for (let waited = 0; job.status === 'running' && waited < 180_000; waited += 3_000) {
        await new Promise(resolve => setTimeout(resolve, 3_000)); signal.throwIfAborted();
        ({ job } = await imageAction<{ job: typeof job }>('generations.get', { id: job.id }));
      }
      return job.status === 'succeeded' && job.images[0] ? { jobId: job.id, imageId: job.images[0].id } : { reason: job.error || (job.status === 'running' ? '三分钟内没有画完' : '没有画出来') };
    },
  };
  const mockupImage: NonNullable<Studio['mockupImage']> = (jobId, imageId) => imageAction<{ base64: string; mime_type: string }>('image.read', { id: jobId, image_id: imageId });
  return { mockups: images, mockupImage };
}
