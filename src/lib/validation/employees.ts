import { z } from "zod";
import { authIdentifierSchema } from "./auth";

export const inviteEmployeeSchema = z.object({
  identifier: authIdentifierSchema,
  roleKey: z.enum(["owner", "manager", "employee"]),
  allBranches: z.boolean().default(false),
  branchIds: z.array(z.string()).default([]),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

export const changeEmployeeRoleSchema = z.object({
  roleKey: z.enum(["owner", "manager", "employee"]),
});
