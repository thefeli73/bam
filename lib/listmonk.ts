import "server-only";

export type listmonkData = {
  email: string;
  name: string;
  status: "enabled" | "blocklisted";
  lists: number[];
  attribs: {};
};

async function makeApiCall(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error making API call:", error);
    throw error;
  }
}

async function listmonk(data: listmonkData) {
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
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const responseData = await response.json();
    console.log("Subscriber created successfully:", responseData);
  } catch (error) {
    console.error("Failed to create subscriber:", error);
  }
}

export default listmonk;
