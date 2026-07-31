import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClerkAdmission, ClerkAdmissionUnavailable } from "./ClerkAdmission";

vi.mock("@clerk/react", () => ({
  SignIn: ({
    fallbackRedirectUrl,
    waitlistUrl,
    withSignUp
  }: {
    fallbackRedirectUrl?: string;
    waitlistUrl?: string;
    withSignUp?: boolean;
  }) => (
    <div
      data-fallback-redirect={fallbackRedirectUrl}
      data-waitlist-url={waitlistUrl}
      data-with-sign-up={String(withSignUp)}
    >
      Clerk sign in
    </div>
  ),
  Waitlist: ({ signInUrl }: { signInUrl?: string }) => (
    <div data-sign-in-url={signInUrl}>Clerk waitlist</div>
  )
}));

describe("Clerk admission", () => {
  it("directs new Guests to Clerk Waitlist without promising member access", async () => {
    const user = userEvent.setup();
    render(<ClerkAdmission />);

    expect(
      screen.getByRole("heading", { name: /request member access/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/guest limits continue/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /request member access/i })
    );

    expect(screen.getByText("Clerk waitlist")).toHaveAttribute(
      "data-sign-in-url",
      "/?access=sign-in"
    );
    expect(
      screen.getByText(/confirmation does not disclose account or invitation status/i)
    ).toBeInTheDocument();
  });

  it("lets existing Clerk accounts reach sign-in without exposing sign-up", async () => {
    const user = userEvent.setup();
    render(<ClerkAdmission />);

    await user.click(
      screen.getByRole("button", {
        name: /sign in with an existing clerk account/i
      })
    );

    expect(screen.getByText("Clerk sign in")).toHaveAttribute(
      "data-fallback-redirect",
      "/"
    );
    expect(screen.getByText("Clerk sign in")).toHaveAttribute(
      "data-waitlist-url",
      "/?access=waitlist"
    );
    expect(screen.getByText("Clerk sign in")).toHaveAttribute(
      "data-with-sign-up",
      "false"
    );
  });

  it("keeps Guest scanning available when Clerk is not configured", () => {
    render(<ClerkAdmissionUnavailable />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /access requests are temporarily unavailable/i
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /guest scanner still works/i
    );
  });

  it("gives a signed-in Clerk account a sign-out surface without promising membership", () => {
    render(
      <ClerkAdmission
        isSignedIn
        accountControl={<button type="button">Sign out account</button>}
      />
    );

    expect(
      screen.getByRole("heading", { name: /account signed in/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/checks your active membership/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out account/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /request member access/i })
    ).not.toBeInTheDocument();
  });
});
