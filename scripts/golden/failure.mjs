/** A failure that says where and which code, never what the data was (UPG2-03). */
export function goldenFailure(code, where) {
  return Object.assign(new Error(code), { code, where });
}
