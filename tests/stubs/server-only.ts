// Stand-in for the `server-only` package under Vitest. The real module throws
// on import outside a React Server Component; it exists to fail the build if
// server code leaks into a client bundle, which is not a concern in tests.
export {};
