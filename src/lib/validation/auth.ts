import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

export const emailSchema = z.email();

export const phoneSchema = z
  .string()
  .refine((value) => isValidPhoneNumber(value), {
    message: "Enter a valid phone number in international format, e.g. +14155552671",
  });

export const authIdentifierSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("EMAIL"), target: emailSchema }),
  z.object({ channel: z.literal("PHONE"), target: phoneSchema }),
]);

export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Enter the 6-digit code");
