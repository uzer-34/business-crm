import { z } from "zod";

export const createVehicleSchema = z.object({
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  plateNumber: z.string().trim().max(40).optional(),
  vin: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const editVehicleSchema = createVehicleSchema;
