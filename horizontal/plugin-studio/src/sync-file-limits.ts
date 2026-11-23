import { SANDBOX_PACKAGE_FILES } from '@molis-ai/molis-work-contracts/platform/plugin';

const SOURCE_LIMIT = 8 * 1024 * 1024, JSON_LIMIT = 4 * 1024 * 1024;
export const BUILDER_SYNC_TOTAL_BYTES = 100_000_000;
const members = Object.values(SANDBOX_PACKAGE_FILES);
const base64Bytes = (size:number) => 4 * Math.ceil(size / 3);
// A compact Studio distribution contains one 8 MiB entrypoint, four 4 MiB JSON members,
// the manifest as an object as well as a member, an Ed25519 signature and a DER SPKI key.
const emptyEnvelope = JSON.stringify({payload:{schema_version:/* @version format.plugin.package */ 1,manifest:{},files:members.map(path=>({path,content_base64:''}))},
  signature:{algorithm:'ed25519',value_base64:''},publisher_key:{algorithm:'ed25519',spki_base64:''}});
const signedLimit = Buffer.byteLength(emptyEnvelope) - 2 + JSON_LIMIT + base64Bytes(64) + base64Bytes(44)
  + members.reduce((total,path)=>total+base64Bytes(path===SANDBOX_PACKAGE_FILES.entrypoint?SOURCE_LIMIT:JSON_LIMIT),0);
export function builderSyncFileLimit(slot:unknown,path:unknown):number {
  if(typeof slot==='string'&&/^release-[1-9][0-9]*$/.test(slot)) {
    if(path==='signed-package.json')return Math.min(BUILDER_SYNC_TOTAL_BYTES,signedLimit);
    if(path!==SANDBOX_PACKAGE_FILES.entrypoint)return JSON_LIMIT;
  }
  return SOURCE_LIMIT;
}
