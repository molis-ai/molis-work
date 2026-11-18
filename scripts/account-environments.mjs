import { id, loadProperties, oneOf } from './environment-properties.mjs';
import { isLoopbackHostname } from '@molis-ai/molis-work-contracts/platform/loopback';

const root = new URL('../', import.meta.url);
export const port = 4207;
const installedPort = 4173;
const localSyncOrigin = 'http://127.0.0.1:8788';
const authOrigins = {
  dev: 'http://127.0.0.1:8787',
  test: 'https://auth.test.molis.ai',
  prod: 'https://molis-auth-production.sparkling-silence-0a49.workers.dev',
};

export function workSettings(name, configRoot = root, { publicOnly = false, installed = name === 'prod' } = {}) {
  const { config } = loadProperties(configRoot, name, {
    environmentId: id, applicationId: id, clientId: id,
    desktopClientId: name === 'test' ? id : oneOf(undefined),
    authOrigin: oneOf(authOrigins[name]),
    syncOrigin: name === 'dev' ? oneOf('', localSyncOrigin) : value => {
      if (value === '') return true;
      try {
        const url = new URL(value);
        const testDomain = url.hostname === 'test.molis.ai' || url.hostname.endsWith('.test.molis.ai');
        return url.origin === value && url.protocol === 'https:' &&
          !Object.values(authOrigins).includes(url.origin) && testDomain === (name === 'test') &&
          !isLoopbackHostname(url.hostname) && !url.hostname.endsWith('.localhost');
      } catch { return false; }
    },
  }, publicOnly ? null : {});
  const { syncOrigin, desktopClientId, ...identity } = config;
  if (name === 'test' && desktopClientId === identity.clientId)
    throw new Error('Work test needs distinct source and installed registrations');
  const productOrigin = `http://127.0.0.1:${installed ? installedPort : port}`;
  const account = Object.freeze({
    ...identity,
    clientId: installed && name === 'test' ? desktopClientId : identity.clientId,
    environmentKind: { dev: 'LOCAL', test: 'TEST', prod: 'PRODUCTION' }[name],
    productOrigin, policyProfile: 'unified-account-v2',
    redirectAllowlist: Object.freeze([productOrigin + '/account/callback']),
    providerMode: 'LIVE', deliveryMode: 'LIVE',
  });
  return Object.freeze({ account, syncOrigin });
}

export function workEnvironment(...args) {
  return workSettings(...args).account;
}
