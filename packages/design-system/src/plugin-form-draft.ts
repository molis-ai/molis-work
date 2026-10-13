/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

/** One live form's input generation. A receipt may clear only the draft it submitted. */
export function createPluginFormDraft(form: HTMLFormElement, syncChoices: (scope: ParentNode) => void) {
  let version = 0;
  const edited = () => { version++; };
  form.addEventListener('input', edited);
  form.addEventListener('change', edited);
  return {
    get version() { return version; },
    complete(submitted: number, keepInputs: boolean) {
      if (submitted !== version) return false;
      if (!keepInputs) {
        form.reset();
        form.querySelectorAll<HTMLInputElement>('input[data-pc-choice]').forEach(input => { input.value = input.dataset.pcInitial ?? ''; });
        syncChoices(form);
        form.querySelectorAll('textarea').forEach(area => { area.style.height = ''; });
        form.querySelectorAll('select').forEach(choice => choice.dispatchEvent(new Event('change', { bubbles: true })));
      }
      return true;
    },
  };
}
