import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function sessionGeneration(service, environment, root = join(homedir(), '.molis-environments')) {
  const directory = join(root, service);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'local-session.json');
  let previous;
  try {
    previous = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous?.environment === environment && /^[a-f0-9-]{36}$/u.test(previous.generation)) {
    return previous.generation;
  }
  const generation = randomUUID();
  const temporary = join(directory, generation + '.tmp');
  writeFileSync(temporary, JSON.stringify({ environment, generation }), { flag: 'wx', mode: 0o600 });
  renameSync(temporary, file);
  return generation;
}
