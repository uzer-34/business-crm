"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestOtpAction, verifyOtpAction } from "@/lib/auth/actions";

type Channel = "EMAIL" | "PHONE";
type Step = "identify" | "verify";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("identify");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestOtpAction({ channel, target });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep("verify");
    });
  }

  function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyOtpAction({ channel, target, code });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(nextPath);
      router.refresh();
    });
  }

  if (step === "verify") {
    return (
      <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to <span className="text-foreground">{target}</span>.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={isPending || code.length !== 6}>
          {isPending ? "Verifying…" : "Verify & continue"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => {
            setStep("identify");
            setCode("");
            setError(null);
          }}
        >
          Use a different phone number or email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
      <div className="flex rounded-md border border-border p-1">
        {(["EMAIL", "PHONE"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setChannel(c);
              setTarget("");
            }}
            className={`flex-1 rounded-sm py-1.5 text-sm font-medium transition-colors ${
              channel === c ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            {c === "EMAIL" ? "Email" : "Phone"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="target">{channel === "EMAIL" ? "Email address" : "Phone number"}</Label>
        <Input
          id="target"
          type={channel === "EMAIL" ? "email" : "tel"}
          placeholder={channel === "EMAIL" ? "you@company.com" : "+14155552671"}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          autoComplete={channel === "EMAIL" ? "email" : "tel"}
          required
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={isPending || !target}>
        {isPending ? "Sending code…" : "Send code"}
      </Button>
    </form>
  );
}
