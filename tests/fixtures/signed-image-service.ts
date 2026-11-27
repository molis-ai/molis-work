import { IMAGE_GENERATION_ROLES, IMAGE_GENERATION_SCHEMAS } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract, SandboxOperationExample } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { effectsFromContract, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { fixturePublisher, signedPackage } from "./sandbox-package.js";

/** Real fixed-signer packages with deterministic in-package image responses. No account or paid service participates. */
export function signedImageService(key: string, version: string, incomplete: boolean) {
  const publisher = fixturePublisher('44c-images-' + key);
  const pluginId = 'com.example.image-' + key;
  const connection = key.padEnd(222, 'x');
  const png = key === 'cobalt' ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ2QAAAAASUVORK5CYII='
    : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const bundle = signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const job = { id: key.padEnd(220, 'j'), connection_id: connection, status: 'running', images: [], error: '' };
    const image = { id: key.padEnd(245, 'i') };
    for (const role of IMAGE_GENERATION_ROLES.filter(role => !incomplete || role !== 'image.read')) {
      const schema = IMAGE_GENERATION_SCHEMAS[role];
      const example: SandboxOperationExample = role === 'services.list' ? { input: {}, output: { connections: [{ id: connection, available: true }] } }
        : role === 'image.read' ? { input: { id: job.id, image_id: image.id }, output: { mime_type: 'image/png', base64: png } }
        : { input: role === 'generate' ? { connection_id: connection, request_id: 'one', prompt: 'test' } : { id: job.id }, output: { job } };
      contract.operations.push({ id: 'picture.' + role, kind: role === 'generate' ? 'command' : 'query',
        action_protocol: { kind: 'image_generation', role }, input: structuredClone(schema.input), output: structuredClone(schema.output),
        effects: { storage: role === 'generate' ? ['read', 'write'] : ['read'] }, errors: [], examples: [example] });
    }
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    const body = `const connection = ${JSON.stringify(connection)}, job = ${JSON.stringify(job)}, image = ${JSON.stringify(image)};
      Object.assign(operations, {
        'picture.services.list': async () => ({ connections: [{ id: connection, available: true }] }),
        'picture.generate': async (input, sdk) => { if (input.connection_id !== connection) throw Error('wrong connection');
          await sdk.storage.set('issued-' + input.request_id, input.prompt); await sdk.storage.set('job', job.id); return { job }; },
        'picture.generations.get': async (input, sdk) => { if (input.id !== await sdk.storage.get('job')) throw Error('unknown job'); return { job: { ...job, status: 'succeeded', images: [image] } }; },
        'picture.image.read': async (input, sdk) => { if (input.id !== await sdk.storage.get('job') || input.image_id !== image.id) throw Error('unknown image'); return { mime_type: 'image/png', base64: ${JSON.stringify(png)} }; }
      });
      ${incomplete ? "delete operations['picture.image.read'];" : ''}`;
    files[SANDBOX_PACKAGE_FILES.entrypoint] += '\n' + body;
    return sandboxPluginManifest({ pluginId, version, name: key, publisher: manifest.publisher, presentation: false, effects: effectsFromContract(contract), contract });
  }, { pluginId, version });
  return { key, publisher: publisher.identity, pluginId, connection, png, bundle };
}
