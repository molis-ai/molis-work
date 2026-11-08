import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountManagementActions, matchAccountManagementRoute } from '@molis-ai/molis-work-service-account';

test('WUA-26: entitlement POST is a read action with a fixed route, no caller identity or idempotency input', () => {
  const route = matchAccountManagementRoute('POST', new URL('http://127.0.0.1/api/account/entitlements/check'))!;
  assert.equal(route.action.capability_id, 'account.entitlements.check');
  assert.equal(route.action.operation, 'query');
  assert.equal(route.action.action.effect, 'read');
  assert.deepEqual(route.action.action.permissions, ['account:read']);
  assert.deepEqual(route.action.action.audiences, ['user']);
  assert.equal(route.write, true); // Host must parse and protect the POST body.
  assert.equal(route.idempotency, false); // Read-only central operation does not accept this header.
  assert.equal(accountManagementActions.filter(a => a.operation === 'checkEntitlements').length, 1);
  assert.ok(matchAccountManagementRoute('GET', new URL('http://127.0.0.1/api/account/catalog/features')));
  assert.throws(() => matchAccountManagementRoute('POST', new URL('http://127.0.0.1/api/account/entitlements/check?userId=other')));
  assert.equal(matchAccountManagementRoute('GET', new URL('http://127.0.0.1/api/account/entitlements/check')), null);
});
