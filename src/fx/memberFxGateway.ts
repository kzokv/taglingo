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
      targets: CurrencyCode[];
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
    !keys.includes("targets")
  ) {
    return null;
  }
  const ownerId = url.searchParams.get("ownerId");
  const source = url.searchParams.get("source");
  const targets = url.searchParams
    .get("targets")
    ?.split(",")
    .filter(Boolean);
  if (
    !ownerId ||
    !SOURCE_CURRENCIES.some(({ code }) => code === source) ||
    !targets ||
    targets.length < 1 ||
    targets.length > 3 ||
    !targets.every(
      (target) => isCurrencyCode(target) && source !== target
    ) ||
    new Set(targets).size !== targets.length
  ) {
    return null;
  }
  return {
    ownerId,
    source: source as SourceCurrencyCode,
    targets: targets as CurrencyCode[]
  };
}

export function createMemberFxHandler({
  authenticate,
  memberships,
  preferences,
  loadReferenceRate
}: MemberFxHandlerDependencies) {
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
    const parsed = parseRequest(request);
    if (!parsed) {
      return errorResponse(
        400,
        "malformed_request",
        "Use one Source Currency and one to three saved Target Currencies."
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
      parsed.targets.some(
        (target) => !saved.targetCurrencies.includes(target)
      )
    ) {
      return errorResponse(
        403,
        "target_not_entitled",
        "Select and synchronize this Target Currency before requesting its rate."
      );
    }
    const ipAddress =
      request.headers.get("cf-connecting-ip") ?? "unknown";
    const rates = await Promise.all(
      parsed.targets.map(async (target) => {
        const response = await loadReferenceRate(
          parsed.source,
          target,
          authentication.userId,
          ipAddress
        );
        if (!response.ok) {
          return {
            target,
            error: { status: response.status }
          };
        }
        return { target, rate: await response.json() };
      })
    );
    return Response.json(
      { rates },
      { headers: { "cache-control": "private, no-store" } }
    );
  };
}
