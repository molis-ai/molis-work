import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';

export const localPayloadErrors = defineErrorCodes('storage', {
  local_payload_invalid: 'invalid', local_payload_key_unavailable: 'unavailable',
});
interface AeadInput { key: Uint8Array; aad: Uint8Array }
function check(input: AeadInput & {plaintext?:Uint8Array}): void {
  if (!(input.key instanceof Uint8Array) || input.key.byteLength !== 32) throw localPayloadErrors.local_payload_invalid('Invalid AEAD key');
  if (!(input.aad instanceof Uint8Array)) throw localPayloadErrors.local_payload_invalid('Invalid AEAD aad');
  if (input.plaintext !== undefined && !(input.plaintext instanceof Uint8Array)) throw localPayloadErrors.local_payload_invalid('Invalid AEAD plaintext');
}
function decode(value: string | undefined): Buffer {
  if (value === undefined || !/^[A-Za-z0-9_-]*$/u.test(value)) throw localPayloadErrors.local_payload_invalid('Invalid AEAD sealed value');
  const bytes=Buffer.from(value,'base64url');
  if(bytes.toString('base64url')!==value) throw localPayloadErrors.local_payload_invalid('Invalid AEAD sealed value');
  return bytes;
}
/** Shared synchronous byte primitive. Each caller retains its own fixed format prefix and authenticated scope. */
export function sealLocalAead(prefix: string, input: AeadInput & {plaintext:Uint8Array}): string {
  check(input);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',input.key,iv);
  cipher.setAAD(input.aad);
  const ciphertext=Buffer.concat([cipher.update(input.plaintext),cipher.final()]);
  return `${prefix}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}
export function openLocalAead(prefix: string,input: AeadInput & {encrypted:string}): Uint8Array {
  check(input);
  if(typeof input.encrypted!=='string') throw localPayloadErrors.local_payload_invalid('Invalid AEAD sealed value');
  const parts=input.encrypted.split('.');
  if(parts.length!==4||parts[0]!==prefix) throw localPayloadErrors.local_payload_invalid('Invalid AEAD sealed value');
  const iv=decode(parts[1]),tag=decode(parts[2]),ciphertext=decode(parts[3]);
  if(iv.byteLength!==12||tag.byteLength!==16) throw localPayloadErrors.local_payload_invalid('Invalid AEAD sealed value');
  try {
    const decipher=createDecipheriv('aes-256-gcm',input.key,iv);decipher.setAAD(input.aad);decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext),decipher.final()]));
  } catch { throw localPayloadErrors.local_payload_invalid('Invalid AEAD sealed value'); }
}
