import { IMAGE_GENERATION_ROLES, imageGenerationRoleOf, type ActionCallContext, type ActionView, type ImageGenerationRole } from '@molis-ai/molis-work-contracts/platform/actions';
import type { ensureInstalledPlugins } from '../installed-plugin-host.js';
import type { AgentBuilderPorts, AgentStudioOptions, Studio } from './agent-surface.js';

type ImageRoles = Record<ImageGenerationRole, ActionView>;
type ImageGenerator = { roles: ImageRoles; permissions: string[] };

/** Every available project provider declaring all four image-generation roles (Role 6, `IMAGE_GENERATION_PROTOCOL`), in discovery order. */
function imageGeneratorsOf(views: readonly ActionView[]): ImageGenerator[] {
  const byProvider = new Map<string, Partial<ImageRoles>>();
  for (const view of views) {
    if (!view.availability.available) continue;
    const role = imageGenerationRoleOf(view.action);
    if (!role) continue;
    const group = byProvider.get(view.provider.provider_id) ?? {};
    group[role] ??= view;
    byProvider.set(view.provider.provider_id, group);
  }
  const found: ImageGenerator[] = [];
  for (const group of byProvider.values()) {
    if (!IMAGE_GENERATION_ROLES.every(role => group[role])) continue;
    const roles = group as ImageRoles;
    found.push({ roles, permissions: [...new Set(IMAGE_GENERATION_ROLES.flatMap(role => roles[role].action.permissions))] });
  }
  return found;
}

/**
 * The project's image generator, found by role (Role 6, `IMAGE_GENERATION_PROTOCOL`): the first available provider that declares all four roles.
 * The platform names no image plugin; the permissions the person's call carries are the ones those four actions declare.
 */
export function imageGeneratorOf(views: readonly ActionView[]): ImageGenerator | undefined {
  return imageGeneratorsOf(views)[0];
}

function waitWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** What the studio draws proposals with: the project's image generator, through its own actions and as the person, when an image service is set up. */
export function studioImages(options: AgentStudioOptions, actions: Awaited<ReturnType<typeof ensureInstalledPlugins>>['actions']) {
  const person = (permissions: readonly string[], signal?: AbortSignal): ActionCallContext => ({
    actor_id: options.actorId ?? 'web-user', project_id: actions.project_id, audience: 'user', permissions: [...permissions],
    ...(signal ? { signal } : {}),
  });
  const jobProviders = new Map<string, string>();
  const rememberJobProvider = (jobId: string, providerId: string) => {
    jobProviders.set(jobId, providerId);
    if (jobProviders.size > 200) {
      const oldest = jobProviders.keys().next().value;
      if (oldest !== undefined) jobProviders.delete(oldest);
    }
  };
  const inspectGenerators = async (signal?: AbortSignal): Promise<ImageGenerator[]> => {
    signal?.throwIfAborted();
    return imageGeneratorsOf(options.actions?.inspect ? await options.actions.inspect(person([], signal)) : []);
  };
  // W7: pictures of proposals through the generator's own actions, as the person, when an image service is set up.
  const invokeRole = async <T,>(found: ImageGenerator, role: ImageGenerationRole, input: unknown, signal?: AbortSignal): Promise<T> => {
    signal?.throwIfAborted();
    const view = found.roles[role];
    return await actions.client.invoke(person(found.permissions, signal), { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input) as T;
  };
  const imageService = async (signal?: AbortSignal): Promise<{ generator: ImageGenerator; service: { id: string; available?: boolean } } | undefined> => {
    for (const generator of await inspectGenerators(signal)) {
      signal?.throwIfAborted();
      try {
        const listed = await invokeRole<{ connections: Array<{ id: string; available?: boolean }> }>(generator, 'services.list', {}, signal);
        const service = listed.connections.find(item => item.available !== false);
        if (service) return { generator, service };
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    return undefined;
  };
  const images: NonNullable<AgentBuilderPorts['mockups']> = {
    available: async () => Boolean(await imageService().catch(() => undefined)),
    async draw(request, signal) {
      signal.throwIfAborted();
      const found = await imageService(signal);
      if (!found) return { reason: '没有可用的生图服务' };
      let { job } = await invokeRole<{ job: { id: string; status: string; images: Array<{ id: string }>; error: string } }>(found.generator, 'generate',
        { request_id: 'builder-' + request.key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120), connection_id: found.service.id, prompt: request.prompt }, signal);
      rememberJobProvider(job.id, found.generator.roles.generate.provider.provider_id);
      // One request; waiting is only reading its state, never asking the service again.
      for (let waited = 0; job.status === 'running' && waited < 180_000; waited += 3_000) {
        await waitWithSignal(3_000, signal);
        ({ job } = await invokeRole<{ job: typeof job }>(found.generator, 'generations.get', { id: job.id }, signal));
      }
      return job.status === 'succeeded' && job.images[0] ? { jobId: job.id, imageId: job.images[0].id } : { reason: job.error || (job.status === 'running' ? '三分钟内没有画完' : '没有画出来') };
    },
  };
  const mockupImage: NonNullable<Studio['mockupImage']> = async (jobId, imageId) => {
    const generators = await inspectGenerators();
    if (!generators.length) throw new Error('这个项目里没有图片功能');
    const providerId = jobProviders.get(jobId);
    const ordered = providerId
      ? [...generators.filter(item => item.roles['image.read'].provider.provider_id === providerId), ...generators.filter(item => item.roles['image.read'].provider.provider_id !== providerId)]
      : generators;
    let lastError: unknown;
    for (const generator of ordered) {
      try { return await invokeRole<{ base64: string; mime_type: string }>(generator, 'image.read', { id: jobId, image_id: imageId }); }
      catch (error) { lastError = error; }
    }
    throw lastError;
  };
  return { mockups: images, mockupImage };
}
