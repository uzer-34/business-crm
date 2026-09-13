import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/, "Use an ISO 3166-1 alpha-2 code"),
  addressLine1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
