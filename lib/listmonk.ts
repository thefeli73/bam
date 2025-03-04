import "server-only";

export type listmonkData = {
  email: string;
  name: string;
  status: "enabled" | "blocklisted";
  lists: number[];
  attribs: {};
};

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
      return "Error. Please try again soon.";
    }
    return "Thanks for signing up! Please check your email for a confirmation.";
  } catch (error) {
    return "Error. Please contact us.";
  }
}

export default listmonk;
