// Exercise the same rendered phone-login path in the account contract and account-switch suites.
export async function submitPhoneNumber(page, nationalNumber) {
  await page.wait(`(() => {
    const mode = [...document.querySelectorAll('.account-dialog .account-modes button')]
      .find(button => button.textContent === '手机验证' && !button.disabled && button.getClientRects().length);
    if (!mode) return false;
    mode.setAttribute('data-test-phone-login', '');
    return true;
  })()`);
  await page.click('.account-dialog [data-test-phone-login]');
  await page.fill('.account-form input[name=address]', nationalNumber);
  await page.click('.account-form input[type=checkbox]');
  await page.click('.account-form button[type=submit]');
}

export async function requestPhoneChallenge(page, nationalNumber) {
  await submitPhoneNumber(page, nationalNumber);
  await page.wait("Boolean(document.querySelector('.account-form input[name=code]'))");
}
