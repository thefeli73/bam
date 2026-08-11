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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
    const fetch = options.fetch ?? globalThis.fetch;
    const request = (url: URL, method: string, body?: unknown) =>
      fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: endpoint.authorization,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      });

    const created = await request(endpoint.url, "POST", data);
    if (created.ok) return { ok: true };
    if (created.status !== 409) return { ok: false };

    const normalizedEmail = data.email.trim().toLowerCase();
    const lookupUrl = new URL(endpoint.url);
    lookupUrl.searchParams.set("search", `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    lookupUrl.searchParams.set("per_page", "all");
    const lookup = await request(lookupUrl, "GET");
    if (!lookup.ok) return { ok: false };

    const payload: unknown = await lookup.json();
    if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.results)) {
      return { ok: false };
    }
    const matches: Record<string, unknown>[] = [];
    for (const candidate of payload.data.results) {
      if (!isRecord(candidate) || typeof candidate.email !== "string" || candidate.email.trim() === "") {
        return { ok: false };
      }
      if (candidate.email.trim().toLowerCase() === normalizedEmail) matches.push(candidate);
    }
    if (matches.length !== 1) return { ok: false };

    const subscriber = matches[0];
    if (
      subscriber.status !== "enabled" ||
      typeof subscriber.id !== "number" ||
      !Number.isSafeInteger(subscriber.id) ||
      subscriber.id <= 0 ||
      !Array.isArray(subscriber.lists)
    ) {
      return { ok: false };
    }
    const lists: Record<string, unknown>[] = [];
    for (const list of subscriber.lists) {
      if (
        !isRecord(list) ||
        typeof list.id !== "number" ||
        !Number.isSafeInteger(list.id) ||
        list.id <= 0 ||
        (list.subscription_status !== "confirmed" &&
          list.subscription_status !== "unconfirmed" &&
          list.subscription_status !== "unsubscribed")
      ) {
        return { ok: false };
      }
      lists.push(list);
    }
    const memberships = lists.filter((list) => list.id === 3);
    if (memberships.length > 1) return { ok: false };

    const membership = memberships[0];
    if (membership?.subscription_status === "confirmed") return { ok: true };
    const optinUrl = new URL(endpoint.url);
    optinUrl.pathname += `/${subscriber.id}/optin`;
    if (membership?.subscription_status === "unconfirmed") {
      const optedIn = await request(optinUrl, "POST", {});
      return { ok: optedIn.ok };
    }

    const listsUrl = new URL(endpoint.url);
    listsUrl.pathname += "/lists";
    const membershipBody = { ids: [subscriber.id], target_list_ids: [3] };
    const added = await request(listsUrl, "PUT", {
      ...membershipBody,
      action: "add",
      status: "unconfirmed",
    });
    if (!added.ok) return { ok: false };

    const optedIn = await request(optinUrl, "POST", {});
    return { ok: optedIn.ok };
  } catch {
    return { ok: false };
  }
}
