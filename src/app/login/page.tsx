import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const nextParam = params?.next;
  const nextPath = typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>No password needed — we&apos;ll email or text you a code.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm nextPath={nextPath} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
