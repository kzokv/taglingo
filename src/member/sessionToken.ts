export type GetMemberSessionToken = () => Promise<string | null>;

export interface MemberSession {
  userId: string;
  getSessionToken: GetMemberSessionToken;
}

export async function memberRequestHeaders(
  getSessionToken: GetMemberSessionToken | undefined,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  if (!getSessionToken) {
    return headers;
  }
  const token = await getSessionToken();
  if (!token) {
    throw new Error("The Clerk session token is unavailable.");
  }
  return {
    ...headers,
    authorization: `Bearer ${token}`
  };
}
