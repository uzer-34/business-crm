import "server-only";
import { Resend } from "resend";

export interface OtpProvider {
  sendEmail(to: string, code: string): Promise<void>;
  sendSms(to: string, code: string): Promise<void>;
}

/**
 * Prints the OTP to the server console instead of sending it. Used as the
 * SMS channel unconditionally (no free/real SMS vendor to wire up without a
 * paid account — Twilio etc. require billing, not just an API key, so
 * "swap in a real provider for free" isn't honestly possible for SMS the
 * way it is for email) and as the email channel's fallback when
 * RESEND_API_KEY isn't set.
 */
class ConsoleOtpProvider implements OtpProvider {
  async sendEmail(to: string, code: string): Promise<void> {
    console.log(`[dev-otp] email to ${to}: ${code}`);
  }

  async sendSms(to: string, code: string): Promise<void> {
    console.log(`[dev-otp] sms to ${to}: ${code}`);
  }
}

/**
 * Sends a real email via Resend's API (free tier: 3,000 emails/month).
 * sendSms is never called on this provider — see getOtpProvider().
 */
class ResendOtpProvider implements OtpProvider {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async sendEmail(to: string, code: string): Promise<void> {
    const result = await this.client.emails.send({
      from: this.from,
      to,
      subject: `Your verification code is ${code}`,
      text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  async sendSms(): Promise<void> {
    throw new Error("ResendOtpProvider does not send SMS");
  }
}

/**
 * Email goes through Resend when RESEND_API_KEY is set (a real network
 * call, surfacing Resend's real error if the send fails — never a silent
 * success), otherwise falls back to the console like every channel did
 * before. SMS always logs to the console; see ConsoleOtpProvider's comment
 * for why there's no equivalent free swap-in for it.
 */
class CompositeOtpProvider implements OtpProvider {
  constructor(
    private readonly email: OtpProvider,
    private readonly sms: OtpProvider,
  ) {}

  sendEmail(to: string, code: string): Promise<void> {
    return this.email.sendEmail(to, code);
  }

  sendSms(to: string, code: string): Promise<void> {
    return this.sms.sendSms(to, code);
  }
}

export function getOtpProvider(): OtpProvider {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailProvider = resendApiKey
    ? new ResendOtpProvider(resendApiKey, process.env.OTP_EMAIL_FROM ?? "onboarding@resend.dev")
    : new ConsoleOtpProvider();

  return new CompositeOtpProvider(emailProvider, new ConsoleOtpProvider());
}
