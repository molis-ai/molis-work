/** Serializes lifecycle mutations for one install so start cannot overlap stop. */
export class InstallLocks {
  private readonly tails = new Map<string, Promise<void>>();

  /** Whether an operation of the install is still running or queued. */
  busy(installId: string): boolean {
    return this.tails.has(installId);
  }

  run<T>(installId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(installId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const tail = run.then(() => undefined, () => undefined);
    this.tails.set(installId, tail);
    return run.finally(() => {
      if (this.tails.get(installId) === tail) this.tails.delete(installId);
    });
  }
}
