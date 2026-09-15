import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMolisWorkNpmPackageDirectory } from "@molis-ai/molis-work-app-local-host";

const sourceDirectory = fileURLToPath(new URL("../../../", import.meta.url));
const outputDirectory = path.resolve(process.argv[2] ?? path.join(sourceDirectory, "release", "npm"));
await mkdir(outputDirectory, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), "molis-work-npm-pack-"));
try {
  const { directory } = await createMolisWorkNpmPackageDirectory({
    sourceDirectory, destinationDirectory: path.join(temporary, "package"),
  });
  const output = execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--cache", path.join(temporary, "cache"),
    "--pack-destination", outputDirectory], { cwd: directory, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const [result] = JSON.parse(output);
  console.log(JSON.stringify({ archive: path.join(outputDirectory, result.filename), size: result.size, bundled: result.bundled }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
