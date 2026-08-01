import {
  isMemberPreferences,
  type MemberPreferences
} from "./memberPreferencesApi";

export type LoadMemberPreferences = (
  userId: string,
  signal: AbortSignal
) => Promise<MemberPreferences | null>;

export type SaveMemberPreferences = (
  preferences: MemberPreferences,
  signal: AbortSignal
) => Promise<MemberPreferences>;

export type MemberPreferencesFailureKind = "denied" | "unavailable";

export class MemberPreferencesRequestError extends Error {
  readonly kind: MemberPreferencesFailureKind;

  constructor(kind: MemberPreferencesFailureKind, message: string) {
    super(message);
    this.name = "MemberPreferencesRequestError";
    this.kind = kind;
  }
}

function responseError(response: Response, message: string) {
  return new MemberPreferencesRequestError(
    response.status === 403 ? "denied" : "unavailable",
    message
  );
}

function endpoint(userId: string): string {
  return `/api/preferences?${new URLSearchParams({ ownerId: userId })}`;
}

export const loadMemberPreferencesFromApi: LoadMemberPreferences = async (
  userId,
  signal
) => {
  const response = await fetch(endpoint(userId), {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal
  });
  if (!response.ok) {
    throw responseError(
      response,
      "Active member preferences are unavailable."
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MemberPreferencesRequestError(
      "unavailable",
      "The member preference response was invalid."
    );
  }
  if (!payload || typeof payload !== "object" || !("preferences" in payload)) {
    throw new MemberPreferencesRequestError(
      "unavailable",
      "The member preference response was invalid."
    );
  }
  const preferences = (payload as { preferences: unknown }).preferences;
  if (preferences === null) {
    return null;
  }
  if (!isMemberPreferences(preferences, userId)) {
    throw new MemberPreferencesRequestError(
      "unavailable",
      "The member preference response was invalid."
    );
  }
  return preferences;
};

export const saveMemberPreferencesToApi: SaveMemberPreferences = async (
  preferences,
  signal
) => {
  const response = await fetch(endpoint(preferences.ownerId), {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify(preferences),
    signal
  });
  if (!response.ok) {
    throw responseError(
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
    throw new MemberPreferencesRequestError(
      "unavailable",
      "The saved member preference response was invalid."
    );
  }
  return saved;
};
