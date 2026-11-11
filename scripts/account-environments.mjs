// Public client configuration only. Secrets belong to Auth, never to this file.
export const accountEnvironments = {
  dev: { environmentId: 'unified-local', environmentKind: 'LOCAL', authOrigin: 'http://127.0.0.1:8787', applicationId: 'molis-work-unified-local-app', clientId: 'molis-work-unified-local', port: 4207, providerMode: 'MOCK', deliveryMode: 'MOCK' },
  test: { environmentId: 'unified-staging', environmentKind: 'TEST', authOrigin: 'https://auth-staging.molis.ai', applicationId: 'molis-work-staging-app', clientId: 'molis-work-staging', port: 44207, providerMode: 'LIVE', deliveryMode: 'MOCK' },
  prod: { environmentId: 'auth-production', environmentKind: 'PRODUCTION', authOrigin: 'https://molis-auth-production.sparkling-silence-0a49.workers.dev', applicationId: 'molis-work-production-app', clientId: 'molis-work-production', port: 4207, providerMode: 'LIVE', deliveryMode: 'LIVE' },
};
export function accountEnvironment(name) {
  const preset = accountEnvironments[name];
  if (!preset) throw new Error('Choose dev, test or prod explicitly');
  const { port, ...config } = preset;
  const productOrigin = `http://127.0.0.1:${port}`;
  return { ...config, productOrigin, policyProfile: 'unified-account-v2', redirectAllowlist: [productOrigin + '/account/callback'] };
}
