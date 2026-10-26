import "server-only";

export interface ListmonkData {
  email: string;
  name: string;
  status: "enabled" | "blocklisted";
  lists: number[];
  attribs: Record<string, string>;
}

export type ListmonkResult = { ok: true; ticketEligible: boolean } | { ok: false };

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

function createRequest(authorization: string, options: ListmonkOptions) {
  const fetch = options.fetch ?? globalThis.fetch;
  return (url: URL, method: string, body?: unknown) =>
    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
}

export async function sendTicketEmail(
  email: string,
  ticketUrl: string,
  options: ListmonkOptions = {},
): Promise<{ ok: boolean }> {
  try {
    const env = options.env ?? process.env;
    const templateId = Number(env.LISTMONK_TICKET_TEMPLATE_ID);
    if (!Number.isSafeInteger(templateId) || templateId <= 0) return { ok: false };

    const endpoint = getListmonkEndpoint(env);
    const request = createRequest(endpoint.authorization, options);
    const response = await request(new URL("tx", endpoint.url), "POST", {
      template_id: templateId,
      content_type: "html",
      subscriber_emails: [email],
      data: { ticket_url: ticketUrl },
    });
    if (!response.ok) return { ok: false };
    const payload: unknown = await response.json();
    // Acknowledgement means queued, not delivered.
    return { ok: isRecord(payload) && payload.data === true };
  } catch {
    return { ok: false };
  }
}

export default async function listmonk(data: ListmonkData, options: ListmonkOptions = {}): Promise<ListmonkResult> {
  try {
    const endpoint = getListmonkEndpoint(options.env);
    const request = createRequest(endpoint.authorization, options);

    const created = await request(endpoint.url, "POST", data);
    if (created.ok) return { ok: true, ticketEligible: true };
    if (created.status !== 409) return { ok: false };

    const recoverDuplicate = async (): Promise<boolean> => {
      const normalizedEmail = data.email.trim().toLowerCase();
      const lookupUrl = new URL(endpoint.url);
      lookupUrl.searchParams.set("search", `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
      lookupUrl.searchParams.set("per_page", "all");
      const lookup = await request(lookupUrl, "GET");
      if (!lookup.ok) return false;

      const payload: unknown = await lookup.json();
      if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.results)) {
        return false;
      }
      const matches: Record<string, unknown>[] = [];
      for (const candidate of payload.data.results) {
        if (!isRecord(candidate) || typeof candidate.email !== "string" || candidate.email.trim() === "") {
          return false;
        }
        if (candidate.email.trim().toLowerCase() === normalizedEmail) matches.push(candidate);
      }
      if (matches.length !== 1) return false;

      const subscriber = matches[0];
      if (
        subscriber.status !== "enabled" ||
        typeof subscriber.id !== "number" ||
        !Number.isSafeInteger(subscriber.id) ||
        subscriber.id <= 0 ||
        !Array.isArray(subscriber.lists)
      ) {
        return false;
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
          return false;
        }
        lists.push(list);
      }
      const memberships = lists.filter((list) => list.id === 3);
      if (memberships.length > 1) return false;

      const membership = memberships[0];
      if (membership?.subscription_status === "confirmed") return true;
      const optinUrl = new URL(endpoint.url);
      optinUrl.pathname += `/${subscriber.id}/optin`;
      if (membership?.subscription_status === "unconfirmed") {
        await request(optinUrl, "POST", {}).catch(() => undefined);
        return true;
      }

      const listsUrl = new URL(endpoint.url);
      listsUrl.pathname += "/lists";
      const membershipBody = { ids: [subscriber.id], target_list_ids: [3] };
      const added = await request(listsUrl, "PUT", {
        ...membershipBody,
        action: "add",
        status: "unconfirmed",
      });
      if (!added.ok) return false;

      await request(optinUrl, "POST", {}).catch(() => undefined);
      return true;
    };

    const ticketEligible = await recoverDuplicate().catch(() => false);
    return { ok: true, ticketEligible };
  } catch {
    return { ok: false };
  }
}
