/** The installation renders editable documents inert until their first account registration succeeds. */
export function accountRegistration(L: (text: string) => string, retry: () => Promise<void>) {
  let pending = document.body.hasAttribute('data-account-registering');
  let dialog: HTMLDialogElement | undefined;
  return {
    get pending() { return pending; },
    complete() {
      if (!pending) return;
      pending = false;
      document.body.removeAttribute('data-account-registering');
      document.body.inert = false;
      dialog?.close(); dialog?.remove(); dialog = undefined;
    },
    failure() {
      if (!pending) return;
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'mw-account-popover';
        dialog.style.cssText = 'inset:0;margin:auto';
        dialog.setAttribute('aria-label', L('请求失败，请重试。'));
        dialog.addEventListener('cancel', event => event.preventDefault());
        const message = document.createElement('p'), button = document.createElement('button');
        message.textContent = L('暂时无法读取账号状态。');
        button.type = 'button'; button.textContent = L('重试');
        button.dataset.accountRegistrationRetry = '';
        button.addEventListener('click', () => {
          button.disabled = true;
          void retry().finally(() => { button.disabled = false; });
        });
        dialog.append(message, button); document.body.append(dialog);
      }
      // A modal dialog can receive input while the business document remains inert.
      if (!dialog.open) dialog.showModal();
    },
  };
}
