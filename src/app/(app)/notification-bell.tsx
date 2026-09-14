"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/lib/notifications/actions";
import { IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

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
  const [, startTransition] = useTransition();

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"} className="relative">
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-accent-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[13px] font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              className="cursor-pointer text-[12px] text-foreground-muted hover:text-foreground"
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
            <EmptyState
              icon={BellOff}
              title="No notifications"
              description="Updates about your tasks, orders and invoices will appear here."
              className="py-8"
            />
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={n.linkPath ?? "#"}
                onClick={() => {
                  if (!n.readAt) {
                    startTransition(async () => {
                      await markNotificationReadAction(n.id);
                      router.refresh();
                    });
                  }
                }}
                className={cn(
                  "block border-b border-border px-3 py-2 text-[13px] last:border-b-0 hover:bg-hover",
                  n.readAt ? "text-foreground-muted" : "font-medium text-foreground",
                )}
              >
                {n.message}
                <p className="mt-0.5 text-[11px] font-normal text-foreground-subtle">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </Link>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
