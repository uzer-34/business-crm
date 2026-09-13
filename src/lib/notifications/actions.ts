"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/auth/actions";

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    include: { membership: true },
  });
  if (!notification || notification.membership.userId !== user.id) {
    return { ok: false, error: "Notification not found" };
  }

  if (!notification.readAt) {
    await db.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  }

  return { ok: true, data: undefined };
}

export async function markAllNotificationsReadAction(membershipId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.userId !== user.id) {
    return { ok: false, error: "Not your membership" };
  }

  await db.notification.updateMany({
    where: { membershipId, readAt: null },
    data: { readAt: new Date() },
  });

  return { ok: true, data: undefined };
}
