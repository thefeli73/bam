import "server-only";

export interface ListmonkData {
  email: string;
  name: string;
  status: "enabled" | "blocklisted";
  lists: number[];
  attribs: Record<string, string>;
}

export type ListmonkResult = { ok: true } | { ok: false };

export type ListmonkOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export function getListmonkEndpoint(env: NodeJS.ProcessEnv = process.env): {
  url: URL;
  authorization: string;
} {
  const production = env.NODE_ENV === "production";
  const listmonkUrl = env.LISTMONK_URL || (production ? undefined : "http://localhost:9000/api/");
  const listmonkUser = env.LISTMONK_USER || (production ? undefined : "nouser");
  const listmonkPass = env.LISTMONK_PASS || (production ? undefined : "nopass");

  if (!listmonkUrl) throw new TypeError("LISTMONK_URL is required");
  if (!listmonkUser) throw new TypeError("LISTMONK_USER is required");
  if (!listmonkPass) throw new TypeError("LISTMONK_PASS is required");

  let baseUrl: URL;
  try {
    baseUrl = new URL(listmonkUrl);
  } catch {
    throw new TypeError("LISTMONK_URL must be a valid HTTP(S) URL");
  }
  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    throw new TypeError("LISTMONK_URL must be a valid HTTP(S) URL");
  }
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";

  return {
    url: new URL("subscribers", baseUrl),
    authorization: `Basic ${Buffer.from(`${listmonkUser}:${listmonkPass}`).toString("base64")}`,
  };
}

export default async function listmonk(data: ListmonkData, options: ListmonkOptions = {}): Promise<ListmonkResult> {
  try {
    const endpoint = getListmonkEndpoint(options.env);
    const response = await (options.fetch ?? globalThis.fetch)(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: endpoint.authorization,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}
