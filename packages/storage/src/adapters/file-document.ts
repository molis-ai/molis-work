import fs from 'node:fs';
import path from 'node:path';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import { atomicWriteFileSync } from './atomic-write.js';
import { withFileLock } from './file-lock.js';

const errors = defineErrorCodes('storage', { document_invalid: 'invalid' });
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Opaque owner document. The trusted composition chooses the path; no business format or Home discovery here. */
export function createAtomicFileDocument(filename: string, authorize: () => void): {
  read(): string | null;
  compareAndSet(expected: string | null, value: string): boolean;
  compareAndSetChecked(expected:string|null,value:string,validate:()=>void):boolean;
  withReadLock<R>(read:(current:string|null)=>R):R;
} {
  const target = path.resolve(filename), lock = target + '.lock.sqlite';
  const regular = (name: string) => {
    try {
      const stat = fs.lstatSync(name);
      if (!stat.isFile() || stat.isSymbolicLink()) throw errors.document_invalid('文件条件存储要求普通文件，原内容已保留');
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    }
  };
  const read = () => {
    authorize(); if (!regular(target)) return null;
    try { return utf8.decode(fs.readFileSync(target)); }
    catch (error) {
      if (error instanceof TypeError) throw errors.document_invalid('文件条件存储不是完整 UTF-8，原内容已保留');
      throw error;
    }
  };
  const replace=(expected:string|null,value:string,validate?:()=>void)=>{
    authorize();
    if ((expected !== null && typeof expected !== 'string') || typeof value !== 'string') throw errors.document_invalid('文件条件存储值无效');
    if(utf8.decode(Buffer.from(value,'utf8'))!==value)throw errors.document_invalid('文件条件存储要求完整 Unicode，原内容已保留');
    regular(lock);
    return withFileLock(lock,()=>{
      authorize();if(read()!==expected)return false;validate?.();authorize();atomicWriteFileSync(target,value);return true;
    });
  };
  return {
    read,compareAndSet:(expected,value)=>replace(expected,value),
    compareAndSetChecked:(expected,value,validate)=>replace(expected,value,validate),
    withReadLock(inspect){authorize();regular(lock);return withFileLock(lock,()=>{const result=inspect(read());authorize();return result;});},
  };
}
