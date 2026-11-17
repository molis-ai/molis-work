/** Pending reviews expire even when nobody reopens the review surface. One timer serves the queue. */
export class ReviewDeadlines {
  readonly #deadlines = new Map<string, number>();
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly now: () => Date, private readonly expire: (id: string) => void) {}

  add(id: string, expires: string | null): void {
    const at = expires === null ? NaN : Date.parse(expires);
    if (!Number.isFinite(at)) return;
    this.#deadlines.set(id, at);
    this.#schedule();
  }

  delete(id: string): void {
    if (this.#deadlines.delete(id)) this.#schedule();
  }

  close(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#deadlines.clear();
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#deadlines.size) return;
    let at = Infinity;
    for (const deadline of this.#deadlines.values()) at = Math.min(at, deadline);
    // Node clamps a larger delay to 1 ms; long-lived reviews must not spin until their deadline.
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const now = this.now().getTime();
      for (const [id, deadline] of this.#deadlines) if (deadline <= now) {
        this.#deadlines.delete(id);
        this.expire(id);
      }
      this.#schedule();
    }, Math.min(2_147_483_647, Math.max(0, at - this.now().getTime())));
    this.#timer.unref();
  }
}
