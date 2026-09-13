"use server";

import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { authIdentifierSchema, otpCodeSchema } from "@/lib/validation/auth";
import { requestOtp, verifyOtp, createSession, revokeSession } from "./otp";
import { SESSION_COOKIE_NAME } from "./session-cookie";

async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function requestOtpAction(input: {
  channel: "EMAIL" | "PHONE";
  target: string;
}): Promise<ActionResult> {
  const parsed = authIdentifierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const ip = await getRequestIp();

  try {
    await requestOtp({ channel: parsed.data.channel, target: parsed.data.target, ip });
    await db.auditLog.create({
      data: { action: "auth.otp_requested", ip, metadata: { channel: parsed.data.channel } },
    });
    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send code";
    return { ok: false, error: message };
  }
}

export async function verifyOtpAction(input: {
  channel: "EMAIL" | "PHONE";
  target: string;
  code: string;
}): Promise<ActionResult> {
  const identifier = authIdentifierSchema.safeParse({ channel: input.channel, target: input.target });
  const code = otpCodeSchema.safeParse(input.code);
  if (!identifier.success || !code.success) {
    return { ok: false, error: "Invalid input" };
  }

  const result = await verifyOtp({
    channel: identifier.data.channel,
    target: identifier.data.target,
    code: code.data,
  });

  if (!result.ok) {
    return { ok: false, error: result.reason };
  }

  const isEmail = identifier.data.channel === "EMAIL";
  const user = await db.user.upsert({
    where: isEmail ? { email: identifier.data.target } : { phone: identifier.data.target },
    create: isEmail ? { email: identifier.data.target } : { phone: identifier.data.target },
    update: {},
  });

  // An employee invite creates the User + a Membership with status INVITED
  // ahead of time (see inviteEmployeeAction) — there's no separate invite
  // link to click, the person just logs in normally. The first successful
  // login after being invited is what actually activates the membership.
  await db.membership.updateMany({
    where: { userId: user.id, status: "INVITED" },
    data: { status: "ACTIVE", joinedAt: new Date() },
  });

  const ip = await getRequestIp();
  const h = await headers();
  const { token, expiresAt } = await createSession({
    userId: user.id,
    userAgent: h.get("user-agent"),
    ip,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await db.auditLog.create({
    data: { action: "auth.login", actorUserId: user.id, ip, metadata: { channel: identifier.data.channel } },
  });

  return { ok: true, data: undefined };
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await revokeSession(token);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
