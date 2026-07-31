import type {
  CurrencyCode,
  SourceCurrencyCode
} from "../domain/currencies";
import {
  isCurrencyCode,
  SOURCE_CURRENCIES
} from "../domain/currencies";

export interface MemberPreferences {
  ownerId: string;
  sourceCurrency: SourceCurrencyCode;
  targetCurrencies: CurrencyCode[];
}

export type AuthenticationResult =
  | { kind: "authenticated"; userId: string; sessionId: string }
  | { kind: "unauthenticated" }
  | { kind: "invalid-session" };

export interface MembershipStore {
  findStatus(userId: string): Promise<"active" | "suspended" | null>;
}

export interface MemberPreferenceStore {
  find(userId: string): Promise<MemberPreferences | null>;
  save(preferences: MemberPreferences): Promise<void>;
}

export interface MemberPreferencesHandlerDependencies {
  authenticate(request: Request): Promise<AuthenticationResult>;
  memberships: MembershipStore;
  preferences: MemberPreferenceStore;
}

function errorResponse(
  status: number,
  code: string,
  message: string
): Response {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: { "cache-control": "private, no-store" }
    }
  );
}

export function isMemberPreferences(
  value: unknown,
  ownerId: string
): value is MemberPreferences {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MemberPreferences>;
  const sourceCurrency = SOURCE_CURRENCIES.some(
    ({ code }) => code === candidate.sourceCurrency
  );
  const targets = candidate.targetCurrencies;
  return (
    candidate.ownerId === ownerId &&
    sourceCurrency &&
    Array.isArray(targets) &&
    targets.length >= 1 &&
    targets.length <= 3 &&
    targets.every(
      (target) =>
        isCurrencyCode(target) && target !== candidate.sourceCurrency
    ) &&
    new Set(targets).size === targets.length
  );
}

export function createMemberPreferencesHandler({
  authenticate,
  memberships,
  preferences
}: MemberPreferencesHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const authentication = await authenticate(request);
    if (authentication.kind === "unauthenticated") {
      return errorResponse(
        401,
        "unauthenticated",
        "Sign in with an Approved Member account."
      );
    }
    if (authentication.kind === "invalid-session") {
      return errorResponse(
        401,
        "invalid_session",
        "The Clerk session is invalid or expired."
      );
    }
    const membershipStatus = await memberships.findStatus(
      authentication.userId
    );
    if (membershipStatus !== "active") {
      return errorResponse(
        403,
        "inactive_membership",
        "An active TagLingo membership is required."
      );
    }
    const requestedOwnerId = new URL(request.url).searchParams.get("ownerId");
    if (requestedOwnerId !== authentication.userId) {
      return errorResponse(
        403,
        "cross_account",
        "Member preferences can only be accessed by their owner."
      );
    }
    if (request.method === "GET") {
      return Response.json(
        { preferences: await preferences.find(authentication.userId) },
        { headers: { "cache-control": "private, no-store" } }
      );
    }
    if (request.method === "PUT") {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        payload = null;
      }
      if (!isMemberPreferences(payload, authentication.userId)) {
        return errorResponse(
          400,
          "malformed_request",
          "Choose one to three distinct Target Currencies."
        );
      }
      await preferences.save(payload);
      return Response.json(
        { preferences: payload },
        { headers: { "cache-control": "private, no-store" } }
      );
    }

    return errorResponse(
      405,
      "method_not_allowed",
      "Only GET and PUT are supported."
    );
  };
}
