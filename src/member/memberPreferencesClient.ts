import {
  isMemberPreferences,
  type MemberPreferences
} from "./memberPreferencesApi";
import {
  memberRequestHeaders,
  type GetMemberSessionToken
} from "./sessionToken";

export type LoadMemberPreferences = (
  userId: string,
  signal: AbortSignal
) => Promise<MemberPreferences | null>;

export type SaveMemberPreferences = (
  preferences: MemberPreferences,
  signal: AbortSignal
) => Promise<MemberPreferences>;

export type MemberPreferencesFailureKind =
  | "inactive-membership"
  | "unauthenticated"
  | "forbidden"
  | "malformed"
  | "unavailable";

export class MemberPreferencesRequestError extends Error {
  readonly kind: MemberPreferencesFailureKind;

  constructor(kind: MemberPreferencesFailureKind, message: string) {
    super(message);
    this.name = "MemberPreferencesRequestError";
    this.kind = kind;
  }
}

async function responseError(response: Response, message: string) {
  let code: unknown;
  try {
    const payload: unknown = await response.json();
    code =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "code" in payload.error
        ? payload.error.code
        : undefined;
  } catch {
    code = undefined;
  }
  const kind: MemberPreferencesFailureKind =
    code === "inactive_membership"
      ? "inactive-membership"
      : code === "unauthenticated" || code === "invalid_session"
        ? "unauthenticated"
        : code === "cross_account"
          ? "forbidden"
          : code === "malformed_request"
            ? "malformed"
            : response.status === 403
              ? "forbidden"
              : "unavailable";
  return new MemberPreferencesRequestError(kind, message);
}

function invalidResponseError() {
  return new MemberPreferencesRequestError(
    "unavailable",
    "The Approved Member preference response was invalid."
  );
}

function endpoint(userId: string): string {
  return `/api/preferences?${new URLSearchParams({ ownerId: userId })}`;
}

async function loadMemberPreferences(
  userId: string,
  signal: AbortSignal,
  getSessionToken?: GetMemberSessionToken
): Promise<MemberPreferences | null> {
  const response = await fetch(endpoint(userId), {
    credentials: "same-origin",
    headers: await memberRequestHeaders(getSessionToken, {
      accept: "application/json"
    }),
    signal
  });
  if (!response.ok) {
    throw await responseError(
      response,
      "Approved Member preferences are unavailable."
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponseError();
  }
  if (!payload || typeof payload !== "object" || !("preferences" in payload)) {
    throw invalidResponseError();
  }
  const preferences = (payload as { preferences: unknown }).preferences;
  if (preferences === null) {
    return null;
  }
  if (!isMemberPreferences(preferences, userId)) {
    throw invalidResponseError();
  }
  return preferences;
}

export const loadMemberPreferencesFromApi: LoadMemberPreferences =
  loadMemberPreferences;

async function saveMemberPreferences(
  preferences: MemberPreferences,
  signal: AbortSignal,
  getSessionToken?: GetMemberSessionToken
): Promise<MemberPreferences> {
  const response = await fetch(endpoint(preferences.ownerId), {
    method: "PUT",
    credentials: "same-origin",
    headers: await memberRequestHeaders(getSessionToken, {
      accept: "application/json",
      "content-type": "application/json"
    }),
    body: JSON.stringify(preferences),
    signal
  });
  if (!response.ok) {
    throw await responseError(
      response,
      "Member preferences could not be synchronized."
    );
  }
  const payload: unknown = await response.json();
  const saved =
    payload && typeof payload === "object" && "preferences" in payload
      ? (payload as { preferences: unknown }).preferences
      : null;
  if (!isMemberPreferences(saved, preferences.ownerId)) {
    throw invalidResponseError();
  }
  return saved;
}

export const saveMemberPreferencesToApi: SaveMemberPreferences =
  saveMemberPreferences;

export function createMemberPreferencesClient(
  getSessionToken: GetMemberSessionToken
): {
  load: LoadMemberPreferences;
  save: SaveMemberPreferences;
} {
  return {
    load: (userId, signal) =>
      loadMemberPreferences(userId, signal, getSessionToken),
    save: (preferences, signal) =>
      saveMemberPreferences(preferences, signal, getSessionToken)
  };
}
