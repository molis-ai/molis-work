export interface SourceHttpResponse {
  body: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  finalUrl: string;
  fetchedAt: string;
}

export interface SourceHttpClient {
  get(
    url: string,
    options?: { headers?: Readonly<Record<string, string>>; signal?: AbortSignal },
  ): Promise<SourceHttpResponse>;
}

export class SourceHttpError extends Error {
  readonly name = "SourceHttpError";

  constructor(readonly code: string) {
    super(code);
  }
}

export class SafePublicHttpClient implements SourceHttpClient {
  constructor(
    private readonly allowedHosts: readonly string[],
    private readonly options: { timeoutMs?: number; maxBytes?: number; userAgent?: string } = {},
  ) {}

  async get(
    url: string,
    options?: { headers?: Readonly<Record<string, string>>; signal?: AbortSignal },
  ): Promise<SourceHttpResponse> {
    let current = this.assertAllowed(url);
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? 12_000);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      let response: Response;
      try {
        response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal,
          headers: {
            accept: "text/html,application/json;q=0.9",
            "user-agent": this.options.userAgent ?? "Adeptify-Alchemist/0.1 (+local market research)",
            ...options?.headers,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new SourceHttpError("SOURCE_TIMEOUT");
        }
        throw new SourceHttpError("SOURCE_NETWORK_ERROR");
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === 3) throw new SourceHttpError("SOURCE_REDIRECT_INVALID");
        current = this.assertAllowed(new URL(location, current).toString());
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > (this.options.maxBytes ?? 8_000_000)) {
        throw new SourceHttpError("SOURCE_RESPONSE_TOO_LARGE");
      }
      return {
        body: new TextDecoder().decode(bytes),
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        finalUrl: current,
        fetchedAt: new Date().toISOString(),
      };
    }
    throw new SourceHttpError("SOURCE_REDIRECT_INVALID");
  }

  private assertAllowed(url: string): string {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !this.allowedHosts.includes(parsed.hostname)) {
      throw new SourceHttpError("SOURCE_URL_NOT_ALLOWED");
    }
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  }
}
