import { createHash } from 'node:crypto';
import { compareCodeUnits } from '@molis-ai/molis-work-plugin-sdk';

export function shelfFileDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Folder identity is independent of upload order and filesystem enumeration order. */
export function shelfFolderDigest(files: readonly {relative:string;digest:string}[]):string {
 const hash=createHash('sha256');
 for(const file of [...files].sort((a,b)=>compareCodeUnits(a.relative,b.relative)))hash.update(`${file.relative}:${file.digest}\n`);
 return hash.digest('hex');
}
