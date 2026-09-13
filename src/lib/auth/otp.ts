import "server-only";
import { randomInt, randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getOtpProvider } from "./otp-provider";
import type { OtpChannel } from "@/generated/prisma/enums";

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_REQUESTS_PER_TARGET_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 20;

export class OtpRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpRateLimitError";
  }
}

export class OtpVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpVerificationError";
  }
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

export async function requestOtp(params: {
  channel: OtpChannel;
  target: string;
  ip: string | null;
}): Promise<void> {
  const { channel, target, ip } = params;
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [lastForTarget, targetCountLastHour, ipCountLastHour] = await Promise.all([
    db.otpChallenge.findFirst({
      where: { target, channel },
      orderBy: { createdAt: "desc" },
    }),
    db.otpChallenge.count({
      where: { target, channel, createdAt: { gte: hourAgo } },
    }),
    ip
      ? db.otpChallenge.count({ where: { requestIp: ip, createdAt: { gte: hourAgo } } })
      : Promise.resolve(0),
  ]);

  if (lastForTarget && now.getTime() - lastForTarget.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new OtpRateLimitError("Please wait before requesting another code.");
  }
  if (targetCountLastHour >= MAX_REQUESTS_PER_TARGET_PER_HOUR) {
    throw new OtpRateLimitError("Too many codes requested for this destination. Try again later.");
  }
  if (ipCountLastHour >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    throw new OtpRateLimitError("Too many requests from this network. Try again later.");
  }

  const code = generateCode();
  await db.otpChallenge.create({
    data: {
      channel,
      target,
      codeHash: hashCode(code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      maxAttempts: MAX_ATTEMPTS,
      requestIp: ip,
    },
  });

  const provider = getOtpProvider();
  if (channel === "EMAIL") {
    await provider.sendEmail(target, code);
  } else {
    await provider.sendSms(target, code);
  }
}

export async function verifyOtp(params: {
  channel: OtpChannel;
  target: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { channel, target, code } = params;

  const challenge = await db.otpChallenge.findFirst({
    where: { target, channel, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    return { ok: false, reason: "No active code for this destination. Request a new one." };
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "Code expired. Request a new one." };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return { ok: false, reason: "Too many attempts. Request a new code." };
  }

  const matches = hashCode(code) === challenge.codeHash;

  if (!matches) {
    await db.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "Incorrect code." };
  }

  await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true };
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(params: {
  userId: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      userAgent: params.userAgent,
      ip: params.ip,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function resolveSession(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return session;
}
