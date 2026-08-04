import { ClerkProvider, UserButton, useAuth } from "@clerk/react";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import CameraPolicyPrototype from "./prototypes/CameraPolicyPrototype";
import CameraWorkspacePrototype from "./prototypes/CameraWorkspacePrototype";
import { createMemberPreferencesClient } from "./member/memberPreferencesClient";
import type { MemberSession } from "./member/sessionToken";
import {
  CLERK_ACCESS_ROUTES,
  ClerkAdmission,
  ClerkAdmissionUnavailable
} from "./auth/ClerkAdmission";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

function ClerkTagLingo() {
  const { getToken, isLoaded, userId } = useAuth();
  const memberUserId = isLoaded ? userId : null;
  const memberSession = useMemo<MemberSession | null>(
    () =>
      memberUserId
        ? { userId: memberUserId, getSessionToken: getToken }
        : null,
    [getToken, memberUserId]
  );
  const memberPreferencesClient = useMemo(
    () => createMemberPreferencesClient(getToken),
    [getToken]
  );
  return (
    <App
      memberSession={memberSession}
      loadMemberPreferences={memberPreferencesClient.load}
      saveMemberPreferences={memberPreferencesClient.save}
      admission={
        <ClerkAdmission
          isSignedIn={Boolean(memberUserId)}
          accountControl={
            memberUserId ? (
              <div className="member-account-control">
                <span>Account and sign out</span>
                <UserButton />
              </div>
            ) : null
          }
        />
      }
    />
  );
}

const requestedPrototype = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("prototype")
  : null;

const application = requestedPrototype === "camera-workspace" ? (
  <CameraWorkspacePrototype />
) : requestedPrototype === "camera-policy" ? (
  <CameraPolicyPrototype />
) : publishableKey ? (
  <ClerkProvider
    publishableKey={publishableKey}
    signInUrl={CLERK_ACCESS_ROUTES.signIn}
    waitlistUrl={CLERK_ACCESS_ROUTES.waitlist}
    signInFallbackRedirectUrl={CLERK_ACCESS_ROUTES.afterSignIn}
    signUpFallbackRedirectUrl={CLERK_ACCESS_ROUTES.afterSignIn}
  >
    <ClerkTagLingo />
  </ClerkProvider>
) : (
  <App admission={<ClerkAdmissionUnavailable />} />
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {application}
  </StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
