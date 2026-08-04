import type {
  CurrencyCode,
  SourceCurrencyCode
} from "../domain/currencies";
import {
  isCurrencyCode,
  SOURCE_CURRENCIES
} from "../domain/currencies";
import { hasExactKeys } from "../domain/exactObject";

export interface MemberPreferences {
  ownerId: string;
  sourceCurrency: SourceCurrencyCode;
  targetCurrencies: CurrencyCode[];
  manualEntryPromotion: ManualEntryPromotion;
  focusedPriceBehavior: FocusedPriceBehavior;
}

export const MANUAL_ENTRY_PROMOTIONS = [
  "after-3-seconds",
  "after-5-seconds",
  "after-10-seconds",
  "only-on-request"
] as const;
export type ManualEntryPromotion = (typeof MANUAL_ENTRY_PROMOTIONS)[number];

export const FOCUSED_PRICE_BEHAVIORS = ["automatic", "confirm"] as const;
export type FocusedPriceBehavior = (typeof FOCUSED_PRICE_BEHAVIORS)[number];

export const DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS = {
  manualEntryPromotion: "after-5-seconds",
  focusedPriceBehavior: "automatic"
} as const satisfies Pick<
  MemberPreferences,
  "manualEntryPromotion" | "focusedPriceBehavior"
>;

export type AuthenticationResult =
  | { kind: "authenticated"; userId: string; sessionId: string }
  | { kind: "unauthenticated" }
  | { kind: "invalid-session" };

export type ApplicationRole = "member" | "administrator";
export type MemberCapability =
  | "preferences:read"
  | "preferences:write"
  | "fx:member"
  | "memberships:manage";

export interface TagLingoMembership {
  status: "active" | "suspended";
  role: ApplicationRole;
}

export interface MembershipStore {
  find(userId: string): Promise<TagLingoMembership | null>;
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

const roleCapabilities: Record<
  ApplicationRole,
  ReadonlySet<MemberCapability>
> = {
  member: new Set([
    "preferences:read",
    "preferences:write",
    "fx:member"
  ]),
  administrator: new Set([
    "preferences:read",
    "preferences:write",
    "fx:member",
    "memberships:manage"
  ])
};

export function authorizesCapability(
  membership: TagLingoMembership | null,
  capability: MemberCapability
): boolean {
  return (
    membership?.status === "active" &&
    roleCapabilities[membership.role].has(capability)
  );
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
  if (
    !hasExactKeys(value, [
      "ownerId",
      "sourceCurrency",
      "targetCurrencies",
      "manualEntryPromotion",
      "focusedPriceBehavior"
    ])
  ) {
    return false;
  }
  const candidate = value;
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
    new Set(targets).size === targets.length &&
    MANUAL_ENTRY_PROMOTIONS.includes(
      candidate.manualEntryPromotion as ManualEntryPromotion
    ) &&
    FOCUSED_PRICE_BEHAVIORS.includes(
      candidate.focusedPriceBehavior as FocusedPriceBehavior
    )
  );
}

export function normalizeMemberPreferences(
  value: unknown,
  ownerId: string
): MemberPreferences | null {
  if (isMemberPreferences(value, ownerId)) {
    return value;
  }
  if (!hasExactKeys(value, ["ownerId", "sourceCurrency", "targetCurrencies"])) {
    return null;
  }
  const candidate = value;
  const withDefaults: unknown = {
    ownerId: candidate.ownerId,
    sourceCurrency: candidate.sourceCurrency,
    targetCurrencies: candidate.targetCurrencies,
    ...DEFAULT_RECOGNITION_EXPERIENCE_SETTINGS
  };
  return isMemberPreferences(withDefaults, ownerId) ? withDefaults : null;
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
    const membership = await memberships.find(authentication.userId);
    const capability =
      request.method === "PUT" ? "preferences:write" : "preferences:read";
    if (!authorizesCapability(membership, capability)) {
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
      const found = await preferences.find(authentication.userId);
      return Response.json(
        {
          preferences: found
            ? normalizeMemberPreferences(found, authentication.userId)
            : null
        },
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
          "Choose one to three distinct Target Currencies and supported experience settings."
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
