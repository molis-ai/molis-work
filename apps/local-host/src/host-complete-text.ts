/** Unique Host injection for plugin text completion. No model is wired yet. */
export type HostCompleteText = (prompt: string) => Promise<string>;

export function hostCompleteText(): HostCompleteText | undefined {
  return undefined;
}
