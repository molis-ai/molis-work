import { execFile } from 'node:child_process';
import { promises as fs, realpathSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize } from 'node:path';
import { promisify } from 'node:util';
import { SandboxError } from './schema.js';

const execFileAsync = promisify(execFile);
const systemLibraryDirectories = ['/System/Library', '/usr/lib'];
const homebrewCellars = ['/opt/homebrew/Cellar', '/usr/local/Cellar'];

function unavailable(reason: string): SandboxError {
  return new SandboxError('sandbox.node_runtime_unavailable',
    `Sandboxed plugins cannot start with this Node.js installation. ${reason} Use the official Node.js build from nodejs.org and restart Molis Work.`);
}

function inHomebrewLib(file: string, cellar: string): boolean {
  return file.startsWith(cellar + '/') && /^[^/]+\/[^/]+\/lib\//u.test(file.slice(cellar.length + 1));
}

/** The loader can report symlinks and run paths containing "..". Only canonical files go into the profile. */
async function resolveNodeLibraries(node: string, images: readonly string[]): Promise<string[]> {
  const nodeDirectory = dirname(node);
  const bin = basename(nodeDirectory) === 'bin';
  const keg = dirname(nodeDirectory);
  const formula = dirname(keg);
  const cellar = dirname(formula);
  const customHomebrew = bin && basename(cellar) === 'Cellar' && /^node(?:@\d+)?$/u.test(basename(formula));
  const cellars = customHomebrew ? [...homebrewCellars, cellar] : homebrewCellars;
  const libraries = new Set<string>();
  for (const image of images) {
    const path = normalize(image);
    if (path === node || systemLibraryDirectories.some(root => path.startsWith(root + '/'))) continue;
    // Resolve the original image name, preserving symlink traversal before any "..".
    const file = await fs.realpath(image).catch(() => undefined);
    if (!file) throw unavailable('A required Node.js library could not be found.');
    const fromNode = dirname(file) === nodeDirectory || (bin && dirname(file) === join(keg, 'lib'));
    if (extname(file) !== '.dylib' || (!fromNode && !cellars.some(root => inHomebrewLib(file, root))) ||
        !(await fs.stat(file).catch(() => undefined))?.isFile()) {
      throw unavailable('A required Node.js library is outside the supported runtime locations.');
    }
    libraries.add(file);
  }
  return [...libraries];
}

/** Ask dyld through a clean Node process. This includes indirect libraries and needs no developer tools. */
export async function inspectNodeRuntime(executable: string, cwd: string): Promise<{ node: string; libraries: string[] }> {
  let node: string;
  let images: unknown;
  try {
    node = await fs.realpath(executable);
    const { stdout } = await execFileAsync(node, ['--no-addons', '-p',
      'process.report.excludeEnv = true; process.report.excludeNetwork = true; JSON.stringify(process.report.getReport().sharedObjects)'],
    { cwd, env: {}, timeout: 3_000, killSignal: 'SIGKILL', maxBuffer: 128 * 1024 });
    images = JSON.parse(stdout);
  } catch {
    throw unavailable('Node.js or one of its libraries could not be loaded in a clean environment.');
  }
  if (!Array.isArray(images) || !images.includes(node) ||
      !images.every((path: unknown): path is string => typeof path === 'string' && isAbsolute(path))) {
    throw unavailable('The Node.js runtime could not report its loaded libraries.');
  }
  return { node, libraries: await resolveNodeLibraries(node, images) };
}

/** Values are host-resolved absolute paths; SBPL strings never contain caller expressions. */
export function seatbeltProfile(paths: { node: string; worker: string; bundle: string; libraries?: readonly string[] }): string {
  const literal = (value: string) => JSON.stringify(realpathSync(value));
  if (process.platform !== 'darwin') throw new SandboxError('sandbox.unsupported_platform', 'Generated plugins require macOS Seatbelt');
  // The checked paths are already canonical; resolving again could follow a replacement symlink.
  const libraries = (paths.libraries ?? []).map(file => ` (literal ${JSON.stringify(file)})`).join('');
  return `(version 1)
(deny default)
(allow process-exec (literal ${literal(paths.node)}))
(deny process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup (global-name "com.apple.system.logger"))
(allow file-read* (literal ${literal(paths.node)}) (literal ${literal(paths.worker)}) (literal ${literal(paths.bundle)})${libraries})
(allow file-read* ${systemLibraryDirectories.map(root => `(subpath "${root}")`).join(' ')} (literal "/dev/urandom") (literal "/dev/random") (literal "/"))
(allow file-read-metadata)
(deny network*)
(deny file-write*)
`;
}
