import "server-only";

export interface OtpProvider {
  sendEmail(to: string, code: string): Promise<void>;
  sendSms(to: string, code: string): Promise<void>;
}

/**
 * Prints the OTP to the server console instead of sending it. This is the
 * only provider wired up right now — swapping in a real SMS/email vendor
 * (Twilio, MSG91, SES, ...) means implementing this interface, not touching
 * any auth business logic.
 */
class ConsoleOtpProvider implements OtpProvider {
  async sendEmail(to: string, code: string): Promise<void> {
    console.log(`[dev-otp] email to ${to}: ${code}`);
  }

  async sendSms(to: string, code: string): Promise<void> {
    console.log(`[dev-otp] sms to ${to}: ${code}`);
  }
}

export function getOtpProvider(): OtpProvider {
  // Real providers are selected here based on env config once implemented,
  // e.g. `process.env.OTP_PROVIDER === "twilio"`.
  return new ConsoleOtpProvider();
}
