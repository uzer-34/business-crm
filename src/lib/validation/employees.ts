import { z } from "zod";
import { authIdentifierSchema } from "./auth";

// Not restricted to the three system role keys with a z.enum: an org can
// now have custom roles too (see src/lib/rbac/role-actions.ts). The actual
// validity check — does a role with this key exist in this org — happens
// in the action itself via db.role.findFirst, which is the only place that
// can know the org's actual role list.
export const inviteEmployeeSchema = z.object({
  identifier: authIdentifierSchema,
  roleKey: z.string().trim().min(1).max(40),
  allBranches: z.boolean().default(false),
  branchIds: z.array(z.string()).default([]),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

export const changeEmployeeRoleSchema = z.object({
  roleKey: z.string().trim().min(1).max(40),
});

export const changeEmployeeBranchesSchema = z.object({
  allBranches: z.boolean(),
  branchIds: z.array(z.string()).default([]),
});
