// Local quick-check state belongs to this checkout, never to a shared Git file.
import { execFileSync } from "node:child_process";
export function healthBaselinePath(root) {
  return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "molis-health-baseline.json"], { cwd: root, encoding: "utf8" }).trim();
}
