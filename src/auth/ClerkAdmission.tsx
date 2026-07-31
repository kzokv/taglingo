import { SignIn, Waitlist } from "@clerk/react";
import { useState } from "react";

type AdmissionView = "summary" | "waitlist" | "sign-in";

export const CLERK_ACCESS_ROUTES = {
  afterSignIn: "/",
  signIn: "/?access=sign-in",
  waitlist: "/?access=waitlist"
} as const;

function initialAdmissionView(): AdmissionView {
  if (typeof window === "undefined") {
    return "summary";
  }

  const requestedView = new URLSearchParams(window.location.search).get(
    "access"
  );
  return requestedView === "waitlist" || requestedView === "sign-in"
    ? requestedView
    : "summary";
}

function AdmissionHeader({
  eyebrow,
  title,
  onBack
}: {
  eyebrow: string;
  title: string;
  onBack?: () => void;
}) {
  return (
    <header className="admission-heading">
      <div>
        <span>{eyebrow}</span>
        <h2 id="member-access-title">{title}</h2>
      </div>
      {onBack ? (
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
      ) : null}
    </header>
  );
}

export function ClerkAdmission() {
  const [view, setView] = useState<AdmissionView>(initialAdmissionView);

  if (view === "waitlist") {
    return (
      <section
        id="member-access"
        className="admission-card admission-embedded"
        aria-labelledby="member-access-title"
      >
        <AdmissionHeader
          eyebrow="Clerk Waitlist"
          title="Request member access"
          onBack={() => setView("summary")}
        />
        <p className="admission-note">
          Clerk validates and submits the email. The confirmation does not
          disclose account or invitation status, and Guest limits continue
          while a request is pending or invited.
        </p>
        <Waitlist signInUrl={CLERK_ACCESS_ROUTES.signIn} />
      </section>
    );
  }

  if (view === "sign-in") {
    return (
      <section
        id="member-access"
        className="admission-card admission-embedded"
        aria-labelledby="member-access-title"
      >
        <AdmissionHeader
          eyebrow="Approved users"
          title="Sign in"
          onBack={() => setView("summary")}
        />
        <p className="admission-note">
          Signing in establishes identity only. Member capabilities still
          require an active TagLingo membership checked by the server.
        </p>
        <SignIn
          routing="hash"
          fallbackRedirectUrl={CLERK_ACCESS_ROUTES.afterSignIn}
          waitlistUrl={CLERK_ACCESS_ROUTES.waitlist}
          withSignUp={false}
        />
      </section>
    );
  }

  return (
    <section
      id="member-access"
      className="admission-card"
      aria-labelledby="member-access-title"
    >
      <AdmissionHeader
        eyebrow="Restricted prototype"
        title="Request member access"
      />
      <p>
        Guests can keep scanning with one Target Currency. Join the Clerk
        Waitlist to request synchronized preferences and up to three Target
        Currencies.
      </p>
      <p className="admission-note">
        Pending and invited people remain Guests. Registration alone does not
        grant member capabilities; Guest limits continue until TagLingo has an
        active membership for the signed-in user.
      </p>
      <div className="admission-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => setView("waitlist")}
        >
          Request member access
          <span aria-hidden="true">→</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setView("sign-in")}
        >
          Sign in as an approved user
        </button>
      </div>
    </section>
  );
}

export function ClerkAdmissionUnavailable() {
  return (
    <section
      id="member-access"
      className="admission-card admission-unavailable"
      role="status"
    >
      <AdmissionHeader
        eyebrow="Restricted prototype"
        title="Access requests are temporarily unavailable"
      />
      <p>
        Clerk is not configured for this deployment. The public Guest scanner
        still works with one Target Currency.
      </p>
    </section>
  );
}
