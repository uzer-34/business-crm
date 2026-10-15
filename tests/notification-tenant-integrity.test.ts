import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyMembership } from "@/lib/notifications/notify";

const mocks = vi.hoisted(() => ({
  membershipFindFirst: vi.fn(),
  notificationCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

const tx = {
  membership: { findFirst: mocks.membershipFindFirst },
  notification: { create: mocks.notificationCreate },
};

const params = {
  organizationId: "org-a",
  membershipId: "membership-a",
  actingMembershipId: "membership-self",
  type: "TASK_ASSIGNED" as const,
  message: "New task",
  linkPath: "/tasks",
};

describe("notification target tenant integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membershipFindFirst.mockResolvedValue({ id: "membership-a" });
  });

  it("inserts only after resolving the recipient in the supplied organization", async () => {
    await notifyMembership(tx as never, params);

    expect(mocks.membershipFindFirst).toHaveBeenCalledWith({
      where: { id: "membership-a", organizationId: "org-a" },
      select: { id: true },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-a",
        membershipId: "membership-a",
        type: "TASK_ASSIGNED",
        message: "New task",
        linkPath: "/tasks",
      },
    });
  });

  it.each(["nonexistent membership", "membership from another organization"])(
    "rejects a %s before inserting",
    async () => {
      mocks.membershipFindFirst.mockResolvedValue(null);

      await expect(notifyMembership(tx as never, params)).rejects.toThrow(
        "Notification target must belong to the supplied organization",
      );
      expect(mocks.notificationCreate).not.toHaveBeenCalled();
    },
  );

  it("keeps the self-notification no-op without inserting", async () => {
    await notifyMembership(tx as never, { ...params, membershipId: "membership-self" });

    expect(mocks.membershipFindFirst).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });
});
