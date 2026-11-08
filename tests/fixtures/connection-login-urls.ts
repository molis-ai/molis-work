/**
 * Login addresses the connection card may and may not open (S-plugin-connection-card, B1): the shell's card and the Assistant's copy
 * of the same check are run on these (tests/security-invariants-connection-login-url.test.ts, tests/assistant-island-script.test.ts).
 */
export const LOGIN_URLS_OPENED = [
  "https://github.com/login/oauth/authorize?client_id=a&state=b",
  "http://127.0.0.1:4207/api/settings/connectors/oauth/callback",
  "http://localhost:4207/callback",
  "http://[::1]:4207/callback",
];

/** A user name before the host makes `http://localhost:@evil.example/` the address of evil.example. */
export const LOGIN_URLS_REFUSED = [
  "http://localhost:@evil.example/cb",
  "http://127.0.0.1:x@evil.example/",
  "http://[::1]:x@evil.example/",
  "https://person:secret@github.com/login",
  "http://evil.example/cb",
  "http://127.0.0.2/cb",
  "http://localhost.evil.example/cb",
  "javascript:alert(1)",
  "file:///etc/passwd",
  "not an address",
  "",
];

/**
 * The places a card's code opens the login address (the system browser, or the window it reserved), each checked by
 * `isConnectionLoginUrl` between the line that reads the address and the line that opens it. Returns the opens that are not.
 */
export function loginOpens(source: string): { opens: number; unchecked: string[] } {
  const unchecked: string[] = [];
  let opens = 0;
  for (const open of source.matchAll(/external\(url\)|location\.replace\(url\)/gu)) {
    opens += 1;
    const from = source.lastIndexOf("const url = ", open.index);
    const between = from < 0 ? "" : source.slice(from, open.index);
    if (!/if \(!isConnectionLoginUrl\(url\)\) throw /u.test(between)) unchecked.push(open[0]);
  }
  return { opens, unchecked };
}
