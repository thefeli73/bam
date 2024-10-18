import "server-only";

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

async function listmonk() {
  const listmonkUrl = process.env.LISTMONK_URL ?? "";
  makeApiCall(listmonkUrl);
}

export default listmonk;
