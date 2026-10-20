import { createHash } from 'node:crypto';
import { bindOwnerPluginAction, createSyncDocument, createSyncJsonContent, defineErrorCodes, definePlugin, type PluginStartContext, type SyncDocument } from '@molis-ai/molis-work-plugin-sdk';

type Note = { text: string; attachment: string | null };
type Data = { notes: Record<string, Note> };
const errors = defineErrorCodes('sample_notes', { invalid: 'invalid', unavailable: 'unavailable', conflict:'conflict' });
function noteKey(key:string):void {if(!/^[a-z0-9-]{1,80}$/.test(key))throw errors.invalid('笔记标识无效');}
function attachmentReference(value: unknown): { digest: string; size: number } | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || !('digest' in value) || typeof value.digest !== 'string' || !('size' in value) || typeof value.size !== 'number') throw errors.invalid('笔记附件引用无效');
  return { digest: value.digest, size: value.size };
}
function note(value: unknown): Note {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'attachment,text'
    || !('text' in value) || typeof value.text !== 'string' || !('attachment' in value)
    || (value.attachment !== null && (typeof value.attachment !== 'string' || !value.attachment || Buffer.from(value.attachment, 'base64').toString('base64') !== value.attachment))) throw errors.invalid('笔记内容无效');
  return value as Note;
}

const noteSchema={anyOf:[{type:'null'},{type:'object',properties:{text:{type:'string',maxLength:100000},attachment:{type:['string','null'],maxLength:140000000}},required:['text','attachment'],additionalProperties:false}]};
const input=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const idSchema={type:'string',pattern:'^[a-z0-9-]{1,80}$'};
const readAction={capability_id:'io.molis.work.example.personal-notes.read',version:1,operation:'query' as const,action:{title:'读取个人笔记',description:'读取当前用户 Home 中的完整笔记与附件。',kind:'query' as const,effect:'read' as const,scope:'home' as const,audiences:['user' as const],permissions:['storage:private'],subject_kinds:[],input_schema:input({id:idSchema}),output_schema:input({value:noteSchema})}};
const changeAction={capability_id:'io.molis.work.example.personal-notes.change',version:1,operation:'command' as const,action:{title:'保存个人笔记',description:'按原内容比较后保存或删除笔记；旧编辑拒绝，正文与日志同次 CAS 提交。',kind:'operation' as const,effect:'write' as const,scope:'home' as const,audiences:['user' as const],permissions:['storage:private'],subject_kinds:[],input_schema:input({id:idSchema,value:noteSchema,expected:noteSchema}),output_schema:input({saved:{const:true}})}};

/** Author code imports only public contracts/SDK. No Host branch, DB schema or Cloudflare request. */
export function createPersonalNotesSample(version = '1.0.0') {
  let document: SyncDocument<Data> | undefined;
  const definition = definePlugin({
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: 'io.molis.work.example.personal-notes', version,
      name: '个人同步笔记样例', kind: 'app', publisher: { publisher_id: 'sample-author', signature: 'sample-author-binding' },
      entrypoints: [{ deployment: 'local', entrypoint: './plugin.js' }], permissions: [{ permission: 'storage:private', required: true, reason: '保存笔记和原子同步日志' }],
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      actions:[readAction,changeAction],
      sync: { protocol_version: 1, collections: [{ id: 'notes', title: '笔记与附件', schema_version: 1, requires: [] }] } },
    async start(context: PluginStartContext) {
      const storage = context.services?.storage, scope = context.sync;
      if (!storage?.compareAndSet || !scope) throw errors.unavailable('样例需要个人空间与原子私人存储');
      const authorize = () => { scope.assertActive(); context.requireGrant('storage:private'); };
      const current = createSyncDocument<Data>({ spaceId: scope.spaceId,
        belongsToProject(){return false;},
        storage: { read: () => storage.get('notes:v1'), compareAndSet: (expected, value) => storage.compareAndSet!('notes:v1', expected, value) },
        authorize, initial: () => ({ notes: {} }),
        validate(value) {
          if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join(',') !== 'notes' || !('notes' in value)
            || !value.notes || typeof value.notes !== 'object' || Array.isArray(value.notes)) throw errors.invalid('笔记目录无效');
          for (const [key, item] of Object.entries(value.notes)) { noteKey(key); note(item); }
          return value as Data;
        },
        observe: data => new Map(Object.entries(data.notes).map(([key, value]) => [key, createHash('sha256').update(JSON.stringify(value)).digest('hex')])),
        read: (data, key) => Object.hasOwn(data.notes,key) ? data.notes[key] : null,
        apply(data, key, value) { noteKey(key); if (value === null) delete data.notes[key]; else data.notes[key] = structuredClone(note(value)); },
      });
      document = current;
      return { kind: 'app' as const, actions:[
        bindOwnerPluginAction(context,readAction,(_input:unknown)=>{const {id}= _input as {id:string};noteKey(id);const data=current.read();return {value:Object.hasOwn(data.notes,id)?data.notes[id]:null};}),
        bindOwnerPluginAction(context,changeAction,(_input:unknown)=>{const {id,value,expected}=_input as {id:string;value:unknown;expected:unknown};noteKey(id);const saved=value===null?null:note(value),prior=expected===null?null:note(expected);current.update(data=>{if(JSON.stringify(Object.hasOwn(data.notes,id)?data.notes[id]:null)!==JSON.stringify(prior))throw errors.conflict('笔记已经变化，未覆盖原内容');if(saved===null)delete data.notes[id];else data.notes[id]=structuredClone(saved);});return {saved:true};}),
      ], sync: [{ collection_id: 'notes', replica: current.replica,
        content: createSyncJsonContent({ spaceId: scope.spaceId, authorize,
          project(_key, value, put) { if (value === null) return null; const item = note(value); return { text: item.text, attachment: item.attachment === null ? null : put(Buffer.from(item.attachment, 'base64')) }; },
          async restore(_key, value, read) {
            if (value === null) return null;
            if (!value || typeof value !== 'object' || !('text' in value) || !('attachment' in value)) throw errors.invalid('笔记附件清单无效');
            const ref = attachmentReference(value.attachment);
            return note({ text: value.text, attachment: ref === null ? null : Buffer.from(await read({ digest: ref.digest, size: ref.size })).toString('base64') });
          },
        }) }] };
    },
  });
  return { definition,
    edit(key: string, value: Note | null) { if (!document) throw errors.unavailable('插件尚未启动'); noteKey(key); document.update(data => { if (value === null) delete data.notes[key]; else data.notes[key] = note(value); }); },
    read() { if (!document) throw errors.unavailable('插件尚未启动'); return document.read(); },
  };
}

/** The distributed entry is a normal PluginDefinition, with all handlers capturing their own activation. */
export default createPersonalNotesSample().definition;
