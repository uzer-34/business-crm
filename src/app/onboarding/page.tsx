import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  getCountryOptions,
  getCurrencyOptions,
  getLanguageOptions,
  getTimezoneOptions,
} from "@/lib/reference/locale-data";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const existingMembership = await db.membership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
  });
  if (existingMembership) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Set up your business</CardTitle>
            <CardDescription>
              This shapes currency, tax, and the terminology you&apos;ll see across the app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm
              countries={getCountryOptions()}
              currencies={getCurrencyOptions()}
              languages={getLanguageOptions()}
              timezones={getTimezoneOptions()}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
