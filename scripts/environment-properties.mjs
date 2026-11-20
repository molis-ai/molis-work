import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';

export function selectEnvironment(args, operation, extra = []) {
  const [flag, name, ...rest] = args;
  const allowed = operation === 'start' ? ['dev', 'test'] : ['test', 'prod'];
  if (flag !== '--env' || !allowed.includes(name) ||
      rest.some((arg, index) => !extra.includes(arg) || rest.indexOf(arg) !== index)) {
    throw new Error(`Usage: ${operation} --env ${allowed.join('|')}${extra.map(flag => ` [${flag}]`).join('')}`);
  }
  return name;
}

function readProperties(url, rules) {
  let input;
  try {
    input = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(url));
  } catch {
    throw new Error(`Missing or unreadable UTF-8 configuration: ${url.pathname}`);
  }
  const entries = new Map();
  for (const [index, line] of input.split(/\r?\n/u).entries()) {
    if (!line.trim() || /^[#!]/u.test(line.trimStart())) continue;
    const match = /^\s*([A-Za-z][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/u.exec(line);
    const invalid = () => new Error(`Invalid configuration at ${url.pathname}:${index + 1}`);
    if (!match) throw invalid();
    const [, key, value] = match;
    if (!Object.hasOwn(rules, key) || entries.has(key)) throw invalid();
    if (/\\(?![\\nrt=#!])/u.test(value)) throw invalid();
    entries.set(key, value.replace(/\\([\\nrt=#!])/gu, (_, char) => (
      { n: '\n', r: '\r', t: '\t' }[char] ?? char
    )));
  }
  for (const [key, validate] of Object.entries(rules)) {
    if (!validate(entries.get(key))) throw new Error(`Missing or invalid field ${key} in ${url.pathname}`);
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function loadProperties(root, name, configRules, secretRules) {
  if (!['dev', 'test', 'prod'].includes(name)) throw new Error('Choose dev, test or prod explicitly');
  return Object.freeze({
    config: readProperties(new URL(`config/${name}.properties`, root), configRules),
    secrets: secretRules === null ? Object.freeze({}) : readProperties(new URL(`secrets/${name}.properties`, root), secretRules),
  });
}

export const required = value => typeof value === 'string' && value.trim().length > 0;
export const id = value => required(value) && /^[A-Za-z0-9_-]+$/u.test(value);
export const uuid = value => required(value) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
export const oneOf = (...values) => value => values.includes(value);

export async function assertPortAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(new Error(`Cannot bind 127.0.0.1:${port} (${error.code})`)));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(resolve));
  });
}
