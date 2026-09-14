// Integration tests talk to the real dev database, so DATABASE_URL has to be
// loaded the same way prisma7.config.ts loads it. Next does this automatically
// at runtime; Vitest does not.
import "dotenv/config";
