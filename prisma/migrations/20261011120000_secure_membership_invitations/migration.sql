-- Store only a hash of each invitation token. Existing INVITED memberships
-- have no token and remain inactive until an authorized member reissues them.
ALTER TABLE "memberships"
    ADD COLUMN "invitationTokenHash" TEXT,
    ADD COLUMN "invitationExpiresAt" TIMESTAMPTZ(3),
    ADD COLUMN "invitedByMembershipId" TEXT;

CREATE UNIQUE INDEX "memberships_invitationTokenHash_key"
    ON "memberships"("invitationTokenHash");
CREATE UNIQUE INDEX "memberships_id_organizationId_key"
    ON "memberships"("id", "organizationId");
CREATE INDEX "memberships_status_invitationExpiresAt_idx"
    ON "memberships"("status", "invitationExpiresAt");

-- A pending invite's issuer must be a membership in the same organization.
ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_invitedByMembershipId_organizationId_fkey"
    FOREIGN KEY ("invitedByMembershipId", "organizationId")
    REFERENCES "memberships"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
