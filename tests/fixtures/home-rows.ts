/** What a test needs of a page driver to wait for a row of the composed project home. */
export interface HomeRowDriver {
  waitFor(expression: string, timeout?: number): Promise<unknown>;
  evaluate<T>(expression: string): Promise<T>;
  click(selector: string): Promise<void>;
}

/**
 * Waits until `selector` (inside the project home) is shown. The home reads every owner under one 3-second budget
 * (specs/surface-composition/spec.md §8.1); on a loaded machine an owner that is slow to answer misses it, and its card says it
 * could not be read and offers 重试 (`data-home-control="refresh"`). That retry is pressed, as a person would, until the
 * row shows or the time is up; the wait itself is not loosened. The first page opens with a few rows and folds the rest under
 * 「另有 N 件」 (`data-home-control="more"`, POLISH-77): a row that is there but folded is opened the same way.
 */
export async function waitForHomeRow(driver: HomeRowDriver, selector: string, owner: string, timeout = 30_000): Promise<void> {
  const shown = "!!document.querySelector(" + JSON.stringify(selector) + ")?.checkVisibility()";
  const retry = `[data-home-card="${owner}"] [data-home-control="refresh"]`, more = '[data-work-surface="home"] [data-home-control="more"]';
  const there = (control: string) => driver.evaluate<boolean>("!!document.querySelector(" + JSON.stringify(control) + ")?.checkVisibility()");
  for (const deadline = Date.now() + timeout; ;) {
    try {
      await driver.waitFor(shown + " || !!document.querySelector(" + JSON.stringify(more) + ")?.checkVisibility()", 5_000);
      if (await driver.evaluate<boolean>(shown)) return;
      await driver.click(more);
      await driver.waitFor(shown, 5_000);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      if (await there(retry)) await driver.click(retry);
    }
  }
}
