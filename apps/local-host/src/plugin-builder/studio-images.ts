import type { AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import type { ensureInstalledPlugins } from '../installed-plugin-host.js';
import type { AgentStudioOptions, Studio } from './studio-types.js';

/** What the studio draws proposals with: the project's images plugin, through its own actions and as the person, when an image service is set up. */
export function studioImages(options: AgentStudioOptions, actions: Awaited<ReturnType<typeof ensureInstalledPlugins>>['actions']) {
  // W7: pictures of proposals through the images plugin's own actions, as the person, when an image service is set up.
  const imageAction = async <T,>(capability: string, input: unknown): Promise<T> => {
    const caller = { actor_id: options.actorId ?? 'web-user', project_id: actions.project_id, audience: 'user' as const, permissions: ['images:connections:read', 'images:generate', 'images:files:write', 'images:read'] };
    const view = (options.actions?.inspect ? await options.actions.inspect(caller) : []).find(item => item.capability_id === capability);
    if (!view) throw new Error('这个项目里没有图片功能');
    return await actions.client.invoke(caller, { capability_id: capability, version: view.version, provider_id: view.provider.provider_id }, input) as T;
  };
  const imageService = async () => (await imageAction<{ connections: Array<{ id: string; available?: boolean }> }>('images.connections.list', {})).connections.find(item => item.available !== false);
  const images: NonNullable<AgentBuilderPorts['mockups']> = {
    available: async () => Boolean(await imageService().catch(() => undefined)),
    async draw(request, signal) {
      const service = await imageService();
      if (!service) return { reason: '没有可用的生图服务' };
      let { job } = await imageAction<{ job: { id: string; status: string; images: Array<{ id: string }>; error: string } }>('images.jobs.start',
        { request_id: 'builder-' + request.key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120), connection_id: service.id, prompt: request.prompt });
      // One request; waiting is only reading its state, never asking the service again.
      for (let waited = 0; job.status === 'running' && waited < 180_000; waited += 3_000) {
        await new Promise(resolve => setTimeout(resolve, 3_000)); signal.throwIfAborted();
        ({ job } = await imageAction<{ job: typeof job }>('images.jobs.get', { id: job.id }));
      }
      return job.status === 'succeeded' && job.images[0] ? { jobId: job.id, imageId: job.images[0].id } : { reason: job.error || (job.status === 'running' ? '三分钟内没有画完' : '没有画出来') };
    },
  };
  const mockupImage: NonNullable<Studio['mockupImage']> = (jobId, imageId) => imageAction<{ base64: string; mime_type: string }>('images.images.read', { id: jobId, image_id: imageId });
  return { mockups: images, mockupImage };
}
