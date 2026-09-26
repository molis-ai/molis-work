import { realpathSync } from 'node:fs';
import { SandboxError } from './schema.js';

/** Values are host-resolved absolute paths; SBPL strings never contain caller expressions. */
export function seatbeltProfile(paths: { node: string; worker: string; bundle: string }): string {
  const literal = (value: string) => JSON.stringify(realpathSync(value));
  if (process.platform !== 'darwin') throw new SandboxError('UNSUPPORTED_PLATFORM', 'Generated plugins require macOS Seatbelt');
  return `(version 1)
(deny default)
(allow process-exec (literal ${literal(paths.node)}))
(deny process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup (global-name "com.apple.system.logger"))
(allow file-read* (literal ${literal(paths.node)}) (literal ${literal(paths.worker)}) (literal ${literal(paths.bundle)}))
(allow file-read* (subpath "/System/Library") (subpath "/usr/lib") (literal "/dev/urandom") (literal "/dev/random") (literal "/"))
(allow file-read-metadata)
(deny network*)
(deny file-write*)
`;
}
