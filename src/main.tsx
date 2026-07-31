import { ClerkProvider, UserButton, useAuth } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import {
  CLERK_ACCESS_ROUTES,
  ClerkAdmission,
  ClerkAdmissionUnavailable
} from "./auth/ClerkAdmission";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

function ClerkTagLingo() {
  const { isLoaded, userId } = useAuth();
  const memberUserId = isLoaded ? userId : null;
  return (
    <App
      memberUserId={memberUserId}
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

const application = publishableKey ? (
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
