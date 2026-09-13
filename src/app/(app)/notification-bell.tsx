"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";

type NotificationItem = {
  id: string;
  message: string;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell({
  membershipId,
  notifications,
}: {
  membershipId: string;
  notifications: NotificationItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-foreground hover:bg-accent"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border p-3">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    startTransition(async () => {
                      await markAllNotificationsReadAction(membershipId);
                      router.refresh();
                    });
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.linkPath ?? "#"}
                    onClick={() => {
                      setOpen(false);
                      if (!n.readAt) {
                        startTransition(async () => {
                          await markNotificationReadAction(n.id);
                          router.refresh();
                        });
                      }
                    }}
                    className={`block border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-accent ${
                      n.readAt ? "text-muted-foreground" : "font-medium"
                    }`}
                  >
                    {n.message}
                    <p className="text-xs font-normal text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
