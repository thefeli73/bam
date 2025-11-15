import "server-only";

export interface listmonkData {
  email: string;
  name: string;
  status: "enabled" | "blocklisted";
  lists: number[];
  attribs: Record<string, string>;
}

async function listmonk(data: listmonkData): Promise<string> {
  const listmonkUrl = process.env.LISTMONK_URL ?? "http://localhost:9000/api/";
  const listmonkUser = process.env.LISTMONK_USER ?? "nouser";
  const listmonkPass = process.env.LISTMONK_PASS ?? "nopass";
  // Encode the username and password in base64
  const credentials = Buffer.from(`${listmonkUser}:${listmonkPass}`).toString("base64");

  const options: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(data),
  };
  try {
    const response = await fetch(`${listmonkUrl}subscribers`, options);
    if (!response.ok) {
      return "An error occurred or this email is already subscribed.";
    }
    return "Thanks for signing up! Please check your email for a confirmation.";
  } catch {
    return "An error occurred while trying to sign up. Please try again.";
  }
}

export default listmonk;
