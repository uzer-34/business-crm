import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { resolveSession } from "./otp";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export { SESSION_COOKIE_NAME };

/**
 * Cached per-request: safe to call from multiple layouts/pages without
 * hitting the database more than once for the same request.
 */
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await resolveSession(token);
  return session?.user ?? null;
});
