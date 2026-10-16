import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';

// Rust reads this owner-only file and sends a header to the fixed local host.
// Never put this capability in a browser cookie, page script, HTML or URL.
export const NATIVE_SESSION_FILE = 'config/native-session-token';
export const NATIVE_SESSION_HEADER = 'x-molis-work-native-session';

export function createPersonalNativeSession(homeDirectory: string) {
  const file = path.join(homeDirectory, NATIVE_SESSION_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let token: string;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 128 || (process.platform !== 'win32' &&
      ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) {
      throw new Error('NATIVE_SESSION_FILE_UNSAFE');
    }
    token = fs.readFileSync(fd, 'utf8').trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('NATIVE_SESSION_FILE_INVALID');
  } finally { fs.closeSync(fd); }
  const expected = Buffer.from(token);
  return (request: IncomingMessage): boolean => {
    const value = request.headers[NATIVE_SESSION_HEADER];
    if (typeof value !== 'string') return false;
    const supplied = Buffer.from(value);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
}
