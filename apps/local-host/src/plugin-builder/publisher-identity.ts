import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginPackageSigner } from '@molis-ai/molis-work-contracts/platform/plugin';
import { createLazyFileSecretStore } from '@molis-ai/molis-work-storage';
import { pluginPublisherIdentity } from '@molis-ai/molis-work-plugin-runtime';
import { HomeConsentLedger } from '../home-plugin-store.js';

const failures = defineErrorCodes('plugin_builder', { publisher_identity_invalid: 'invalid', publisher_revoked: 'forbidden' });
const REF = 'plugin-builder-publisher:signing-key';
interface Identity { secret_ref: string; key_id: string; public_key_spki_base64: string }
const invalid = (): never => { throw failures.publisher_identity_invalid('发布身份缺失或不一致，请恢复这个 Home 原来的签名密钥；不会自动更换发布者'); };

function readIdentity(file: string): Identity | null {
  const stat = lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) return invalid();
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { return invalid(); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== 3 || value.secret_ref !== REF || typeof value.key_id !== 'string' || typeof value.public_key_spki_base64 !== 'string') return invalid();
  return { secret_ref: REF, key_id: value.key_id, public_key_spki_base64: value.public_key_spki_base64 };
}

/** Only an explicit publication calls this. SecretStore owns the sealed key; no pin or project-owned secret is created. */
export async function studioPublisherIdentity(home: string, control: { beforeEffect(): Promise<void>; assertCurrent(): void }): Promise<PluginPackageSigner & { assertCurrent(): void }> {
  await control.beforeEffect(); control.assertCurrent();
  const directory = join(home, 'config'), file = join(directory, 'plugin-publisher.json');
  const directoryStat = lstatSync(directory, { throwIfNoEntry: false });
  if (directoryStat && (!directoryStat.isDirectory() || directoryStat.isSymbolicLink())) return invalid();
  const known = readIdentity(file), secrets = createLazyFileSecretStore(home);
  let encoded: string | null;
  try { encoded = secrets.get(REF); } catch { return invalid(); }
  if (!encoded) {
    if (known) return invalid();
    const candidate = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    control.assertCurrent(); secrets.createIfAbsent(REF, candidate);
    encoded = secrets.get(REF);
  }
  if (!encoded) return invalid();
  let key: KeyObject;
  try { key = createPrivateKey(encoded); } catch { return invalid(); }
  const publicKey = createPublicKey(key), keyId = pluginPublisherIdentity(publicKey), spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  if (known && (known.key_id !== keyId || known.public_key_spki_base64 !== spki)) return invalid();
  const assertCurrent = () => {
    control.assertCurrent();
    if (new HomeConsentLedger(home).publishers().some(pin => pin.key_id === keyId && pin.revoked_at)) throw failures.publisher_revoked('这个 Home 的发布者已撤销，不能重新生成身份绕过撤销；已有产物保留');
  };
  assertCurrent();
  if (!known) {
    const metadata: Identity = { secret_ref: REF, key_id: keyId, public_key_spki_base64: spki };
    control.assertCurrent(); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, '.plugin-publisher-' + randomUUID());
    try {
      control.assertCurrent(); writeFileSync(temporary, JSON.stringify(metadata) + '\n', { mode: 0o600, flag: 'wx' });
      control.assertCurrent();
      try { linkSync(temporary, file); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const winner = readIdentity(file);
      if (!winner || winner.key_id !== keyId || winner.public_key_spki_base64 !== spki) return invalid();
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  control.assertCurrent();
  return { publisher_identity: keyId, public_key_spki_base64: spki, assertCurrent, sign(bytes) { assertCurrent(); return sign(null, bytes, key); } };
}
