import { promises as fs } from "node:fs";
export async function exists(filePath: string): Promise<boolean> {
  return (await statOrNull(filePath)) != null;
}

async function statOrNull(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
