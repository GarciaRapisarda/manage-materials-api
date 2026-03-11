import { API_BASE_URL } from "@/config/api";
import type { LoginCredentials, TokenResponse } from "@/types/auth";

export async function login(credentials: LoginCredentials): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Error ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as TokenResponse & { token?: string };
  return json.access_token ?? json.token ?? "";
}
