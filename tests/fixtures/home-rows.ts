/** What a test needs of a page driver to wait for a row of the composed project home. */
export interface HomeRowDriver {
  waitFor(expression: string, timeout?: number): Promise<unknown>;
  evaluate<T>(expression: string): Promise<T>;
  click(selector: string): Promise<void>;
}

/**
 * Waits until `selector` (inside the project home) is shown. The home reads every owner under one 1-second budget
 * (specs/surface-composition/spec.md §8.1); on a loaded machine an owner that is slow to answer misses it, and its card says it
 * could not be read and offers 重试 (`data-home-control="refresh"`). That retry is pressed, as a person would, until the
 * row shows or the time is up; the wait itself is not loosened.
 */
export async function waitForHomeRow(driver: HomeRowDriver, selector: string, owner: string, timeout = 30_000): Promise<void> {
  const shown = "!!document.querySelector(" + JSON.stringify(selector) + ")?.checkVisibility()";
  const retry = `[data-home-card="${owner}"] [data-home-control="refresh"]`;
  for (const deadline = Date.now() + timeout; ;) {
    try {
      await driver.waitFor(shown, 5_000);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      if (await driver.evaluate<boolean>("!!document.querySelector(" + JSON.stringify(retry) + ")?.checkVisibility()")) await driver.click(retry);
    }
  }
}
