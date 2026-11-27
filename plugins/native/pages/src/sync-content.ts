import { createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { syncError } from './sync-errors.js';

const DATA_IMAGE = /^(data:image\/(?:png|jpeg|gif|webp);base64,)([A-Za-z0-9+/]+={0,2})$/i;
const DATA_IMAGE_PREFIX = /^data:image\/(?:png|jpeg|gif|webp);base64,$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The Pages owner chooses its document body; the platform does not inspect arbitrary plugin records. */
export function createPagesSyncContent(context: { spaceId: string; authorize(): void }) {
  return createSyncJsonContent({
    ...context,
    project(_key, input, put) {
      const projectImageSrc = (src: unknown): unknown => {
        if (isPlainObject(src) && Object.hasOwn(src, 'sync_image')) {
          throw syncError('invalid', '文档包含保留的同步字段');
        }
        if (typeof src !== 'string') return src;
        const match = DATA_IMAGE.exec(src);
        if (!match) return src;
        const bytes = Buffer.from(match[2]!, 'base64');
        if (bytes.toString('base64') !== match[2]) throw syncError('invalid', '文档图片编码无效');
        return { sync_image: put(bytes), prefix: match[1] };
      };
      const walk = (node: unknown, depth = 0): unknown => {
        if (depth > 100) throw syncError('invalid', '文档图片结构过深');
        if (Array.isArray(node)) return node.map(child => walk(child, depth + 1));
        if (!isPlainObject(node)) return node;
        if (Object.hasOwn(node, 'sync_image')) throw syncError('invalid', '文档包含保留的同步字段');
        const next: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(node)) {
          if (node.type === 'image' && key === 'attrs' && isPlainObject(child)) {
            if (Object.hasOwn(child, 'sync_image')) throw syncError('invalid', '文档包含保留的同步字段');
            const attrs: Record<string, unknown> = {};
            for (const [attrKey, attrVal] of Object.entries(child)) {
              attrs[attrKey] = attrKey === 'src' ? projectImageSrc(attrVal) : walk(attrVal, depth + 2);
            }
            next[key] = attrs;
          } else {
            next[key] = walk(child, depth + 1);
          }
        }
        return next;
      };
      if (isPlainObject(input) && isPlainObject(input.record) && Object.hasOwn(input.record, 'body')) {
        return { ...input, record: { ...input.record, body: walk(input.record.body) } };
      }
      return input;
    },
    async restore(_key, input, read) {
      const restoreImageSrc = async (src: unknown): Promise<unknown> => {
        if (!isPlainObject(src) || !Object.hasOwn(src, 'sync_image')) return src;
        if (Object.keys(src).sort().join(',') !== 'prefix,sync_image'
          || typeof src.prefix !== 'string'
          || !DATA_IMAGE_PREFIX.test(src.prefix)) {
          throw syncError('invalid', '文档图片引用无效');
        }
        return src.prefix + Buffer.from(await read(src.sync_image as SyncBlobReference)).toString('base64');
      };
      const walk = async (node: unknown, depth = 0): Promise<unknown> => {
        if (depth > 100) throw syncError('invalid', '文档图片结构过深');
        if (Array.isArray(node)) {
          const values: unknown[] = [];
          for (const child of node) values.push(await walk(child, depth + 1));
          return values;
        }
        if (!isPlainObject(node)) return node;
        if (Object.hasOwn(node, 'sync_image')) throw syncError('invalid', '文档图片引用无效');
        const next: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(node)) {
          if (node.type === 'image' && key === 'attrs' && isPlainObject(child)) {
            if (Object.hasOwn(child, 'sync_image')) throw syncError('invalid', '文档图片引用无效');
            const attrs: Record<string, unknown> = {};
            for (const [attrKey, attrVal] of Object.entries(child)) {
              attrs[attrKey] = attrKey === 'src' ? await restoreImageSrc(attrVal) : await walk(attrVal, depth + 2);
            }
            next[key] = attrs;
          } else {
            next[key] = await walk(child, depth + 1);
          }
        }
        return next;
      };
      if (isPlainObject(input) && isPlainObject(input.record) && Object.hasOwn(input.record, 'body')) {
        return { ...input, record: { ...input.record, body: await walk(input.record.body) } };
      }
      return input;
    },
  });
}
