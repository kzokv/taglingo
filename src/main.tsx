import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import {
  CLERK_ACCESS_ROUTES,
  ClerkAdmission,
  ClerkAdmissionUnavailable
} from "./auth/ClerkAdmission";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const application = publishableKey ? (
  <ClerkProvider
    publishableKey={publishableKey}
    signInUrl={CLERK_ACCESS_ROUTES.signIn}
    waitlistUrl={CLERK_ACCESS_ROUTES.waitlist}
    signInFallbackRedirectUrl={CLERK_ACCESS_ROUTES.afterSignIn}
    signUpFallbackRedirectUrl={CLERK_ACCESS_ROUTES.afterSignIn}
  >
    <App admission={<ClerkAdmission />} />
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
