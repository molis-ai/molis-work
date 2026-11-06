import {createHash} from 'node:crypto';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';

const errors=defineErrorCodes('alchemist',{edit_changed:'conflict'});
/** Hash the owner's complete mapped object, including same-number branches received through sync. */
export function studioEditFingerprint(value:object):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function assertStudioEdit(value:object|undefined,expected:string):void{
 if(typeof expected!=='string'||!value||studioEditFingerprint(value)!==expected)
  throw errors.edit_changed('内容已经改变，请重新读取后再保存。');
}
