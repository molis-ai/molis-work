// The document checker reads the tracked paths and their contents from the supplied tree.
export function docGateProblems(snapshot: {
  readonly files: readonly string[];
  read(file: string): string | null;
}): string[];
