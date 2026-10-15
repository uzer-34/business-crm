import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitationForm } from "./accept-invitation-form";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const validFormat = token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
  const user = await getCurrentUser();
  const loginPath = `/login?next=${encodeURIComponent(`/accept-invitation?token=${encodeURIComponent(token)}`)}`;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Accept your invitation</CardTitle>
            <CardDescription>
              Sign in with the email address or phone number this invitation was sent to.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!validFormat ? (
              <p className="text-sm text-danger">This invitation link is invalid or expired.</p>
            ) : user ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Signed in as {user.email ?? user.phone ?? "your account"}. Acceptance checks the inviter&apos;s current
                  membership, permissions, role and branch access.
                </p>
                <AcceptInvitationForm token={token} />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Sign in using the invited account, then return here to accept the invitation.
                </p>
                <Link
                  href={loginPath}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Sign in to continue
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
