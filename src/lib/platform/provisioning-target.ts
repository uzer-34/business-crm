const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export type PlatformProvisioningEnvironment = {
  NODE_ENV?: string;
  PLATFORM_CONTROL_PLANE_ENABLED?: string;
  PLATFORM_PROVISIONING_TARGET?: string;
  DATABASE_URL?: string;
};

/** Fail closed before any DB client is constructed for the bootstrap CLI. */
export function assertLocalPlatformProvisioningTarget(
  environment: PlatformProvisioningEnvironment,
): void {
  if (environment.NODE_ENV === "production") {
    throw new Error("Platform bootstrap is prohibited in production");
  }
  if (environment.PLATFORM_PROVISIONING_TARGET !== "local") {
    throw new Error("Set PLATFORM_PROVISIONING_TARGET=local to run platform bootstrap");
  }
  if (environment.PLATFORM_CONTROL_PLANE_ENABLED === "true") {
    throw new Error("Keep the platform feature gate disabled during bootstrap");
  }
  if (!environment.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for local platform bootstrap");
  }

  let parsed: URL;
  try {
    parsed = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Platform bootstrap requires a PostgreSQL URL");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error("Platform bootstrap is limited to a loopback database host");
  }
}
