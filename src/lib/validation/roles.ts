import { z } from "zod";
import { PERMISSION_CATALOG } from "@/lib/rbac/permissions";

const permissionKeySchema = z.enum(PERMISSION_CATALOG.map((p) => p.key) as [string, ...string[]]);

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only"),
  name: z.string().trim().min(1).max(80),
  permissionKeys: z.array(permissionKeySchema).default([]),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionKeys: z.array(permissionKeySchema).default([]),
});

export const renameRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
