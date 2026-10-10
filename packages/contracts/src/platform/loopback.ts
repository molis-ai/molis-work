/**
 * "Is this address this machine?", written once. The control entry, the sockets, the action gateway, the OAuth return
 * addresses and the endpoint checks of the connectors all ask it; before, each wrote its own list and the lists differed
 * (specs/repository-anti-corruption §6, security invariant S-09). It has no dependencies and no effects.
 *
 * It answers about names only. It never resolves DNS: `localhost` is accepted where a caller allows names, because the
 * browser and the desktop shell address the host by it, and refused where a caller asks for `numeric` (a process talking
 * to the host, which has no reason to trust a resolver).
 */
export interface LoopbackOptions {
  /** Only the numeric loopback addresses (127.0.0.1 and ::1); `localhost` is refused. */
  readonly numeric?: boolean;
}

/**
 * Whether a hostname is a loopback address. Takes the spelling of `URL.hostname` (an IPv6 address keeps its brackets) and
 * the bare IPv6 form that people write in configuration. Nothing else counts: not 127.0.0.2, not 0.0.0.0, not
 * `localhost.` or `foo.localhost`, not an IPv4-mapped IPv6 address.
 */
export function isLoopbackHostname(hostname: string, options: LoopbackOptions = {}): boolean {
  const name = hostname.toLowerCase();
  return name === "127.0.0.1" || name === "[::1]" || name === "::1" || (!options.numeric && name === "localhost");
}

/** A URL that is plain HTTP on a loopback host. Credentials, path, query and fragment are the caller's own rules. */
export function isLoopbackHttpUrl(url: URL, options: LoopbackOptions = {}): boolean {
  return url.protocol === "http:" && isLoopbackHostname(url.hostname, options);
}

/**
 * A loopback HTTP origin and nothing more: plain HTTP, a loopback host, no credentials, no path, no query, no fragment.
 * What a service address, an OAuth return address or a gateway destination has to be.
 */
export function isLoopbackHttpOrigin(url: URL, options: LoopbackOptions = {}): boolean {
  return isLoopbackHttpUrl(url, options) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
}

/**
 * The `host:port` a request's Host header names when it names this machine, else null (a missing, malformed or foreign
 * Host). A server that answers only these cannot be reached through a DNS name an attacker controls (DNS rebinding).
 */
export function loopbackHost(hostHeader: string | undefined | null): string | null {
  const value = hostHeader?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(`http://${value}`);
    return isLoopbackHostname(parsed.hostname) ? parsed.host : null;
  } catch {
    return null;
  }
}
