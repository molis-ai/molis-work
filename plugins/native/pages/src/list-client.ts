/** Error presentation for the document directory, sharing its existing browser bundle. */
export function listFailed(
  { empty, rowsEl, L, loadList }: {
    empty: HTMLElement | null;
    rowsEl: HTMLElement;
    L(text: string): string;
    loadList(): Promise<void>;
  },
  error: { message?: string } | null | undefined,
): void {
  if (empty) empty.hidden = true;
  const box = document.createElement("div");
  box.className = "mw-empty mw-empty--error";
  box.setAttribute("role", "alert");
  box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
  box.querySelector("strong")!.textContent = L("列表暂时读不到");
  box.querySelector("p")!.textContent = error?.message || L("请稍后重试");
  const retry = box.querySelector("button")!;
  retry.textContent = L("重试");
  retry.addEventListener("click", () => {
    retry.disabled = true;
    void loadList().then(() => box.remove(), (next) => {
      retry.disabled = false;
      box.querySelector("p")!.textContent = next?.message || L("请稍后重试");
    });
  });
  rowsEl.replaceChildren(box);
}
