import {isDeepStrictEqual} from 'node:util';
import {SANDBOX_PACKAGE_FILES} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {PluginDistributionVerifier} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import {effectsFromContract} from '@molis-ai/molis-work-plugin-sdk';
import {verifyPluginPackageSignature} from '@molis-ai/molis-work-plugin-runtime';
import {assertHomePackageAllowed} from './home-package-admission.js';
import {releaseVersion} from './installed-release.js';
import {readKeptSandboxPackage} from './sandbox-package.js';

/** Synchronization transports a signed distribution as inert data. Only the normal installation flow can admit it. */
export const verifySyncPluginDistribution: PluginDistributionVerifier = (release, signedPackage, files) => {
  const {bundle,key_id}=verifyPluginPackageSignature(signedPackage);
  const {manifest,contract}=readKeptSandboxPackage(bundle.payload);
  const invalid=()=>new Error('签名分发物与发布记录不符');
  if(!isDeepStrictEqual(signedPackage,bundle) || key_id!==release.publisherKeyId || manifest.plugin_id!==release.pluginId || manifest.version!==releaseVersion(release.version)
    || manifest.publisher.publisher_id!=='molis-studio' || (manifest.runtime?.scope??'project')!==release.runtimeScope)throw invalid();
  if(release.runtimeScope==='home')assertHomePackageAllowed(manifest);
  const required=new Set<string>(Object.values(SANDBOX_PACKAGE_FILES));
  if(files.size!==required.size || bundle.payload.files.length!==required.size)throw invalid();
  for(const member of bundle.payload.files){
    const original=files.get(member.path);
    if(!required.delete(member.path)||!original)throw invalid();
    if(member.path===SANDBOX_PACKAGE_FILES.manifest){
      const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original));
      if(!isDeepStrictEqual(value,{version:1,pluginId:contract.pluginId,revision:contract.revision,effects:effectsFromContract(contract)}))throw invalid();
    }else if(!Buffer.from(member.content_base64,'base64').equals(original))throw invalid();
  }
};
