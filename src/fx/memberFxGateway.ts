import {
  isCurrencyCode,
  SOURCE_CURRENCIES,
  type CurrencyCode,
  type SourceCurrencyCode
} from "../domain/currencies";
import {
  authorizesCapability,
  type AuthenticationResult,
  type MemberPreferenceStore,
  type MembershipStore
} from "../member/memberPreferencesApi";

export interface MemberFxHandlerDependencies {
  authenticate(request: Request): Promise<AuthenticationResult>;
  memberships: MembershipStore;
  preferences: MemberPreferenceStore;
  loadReferenceRate(
    source: SourceCurrencyCode,
    target: CurrencyCode,
    userId: string,
    ipAddress: string
  ): Promise<Response>;
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

function parseRequest(request: Request):
  | {
      ownerId: string;
      source: SourceCurrencyCode;
      target: CurrencyCode;
    }
  | null {
  if (request.method !== "GET" || request.url.length > 768) {
    return null;
  }
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  if (
    keys.length !== 3 ||
    !keys.includes("ownerId") ||
    !keys.includes("source") ||
    !keys.includes("target")
  ) {
    return null;
  }
  const ownerId = url.searchParams.get("ownerId");
  const source = url.searchParams.get("source");
  const target = url.searchParams.get("target");
  if (
    !ownerId ||
    !SOURCE_CURRENCIES.some(({ code }) => code === source) ||
    !isCurrencyCode(target) ||
    source === target
  ) {
    return null;
  }
  return {
    ownerId,
    source: source as SourceCurrencyCode,
    target
  };
}

export function createMemberFxHandler({
  authenticate,
  memberships,
  preferences,
  loadReferenceRate
}: MemberFxHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const parsed = parseRequest(request);
    if (!parsed) {
      return errorResponse(
        400,
        "malformed_request",
        "Use one Source Currency and one saved Target Currency."
      );
    }
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
    const membership = await memberships.find(authentication.userId);
    if (!authorizesCapability(membership, "fx:member")) {
      return errorResponse(
        403,
        "inactive_membership",
        "An active TagLingo membership with FX access is required."
      );
    }
    if (parsed.ownerId !== authentication.userId) {
      return errorResponse(
        403,
        "cross_account",
        "Reference Rates can only use the member's own preferences."
      );
    }
    const saved = await preferences.find(authentication.userId);
    if (
      !saved ||
      saved.sourceCurrency !== parsed.source ||
      !saved.targetCurrencies.includes(parsed.target)
    ) {
      return errorResponse(
        403,
        "target_not_entitled",
        "Select and synchronize this Target Currency before requesting its rate."
      );
    }
    return loadReferenceRate(
      parsed.source,
      parsed.target,
      authentication.userId,
      request.headers.get("cf-connecting-ip") ?? "unknown"
    );
  };
}
