import { assertLocalPlatformProvisioningTarget } from "@/lib/platform/provisioning-target";

async function main() {
  // Guard before importing the Prisma client so an accidental production or
  // remote URL cannot even construct a database adapter.
  assertLocalPlatformProvisioningTarget(process.env);

  const userId = process.argv[2];
  const token = process.env.PLATFORM_BOOTSTRAP_TOKEN;
  if (!userId || !token) {
    throw new Error(
      "Usage: npm run platform:provision-principal -- <user-id> with PLATFORM_BOOTSTRAP_TOKEN set",
    );
  }

  const { provisionPlatformPrincipalFromBootstrap } = await import("@/lib/platform/provisioning");
  const result = await provisionPlatformPrincipalFromBootstrap({ userId, token });
  process.stdout.write(
    `Provisioned platform principal ${result.principalId} with ${result.capability}.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Platform provisioning failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
