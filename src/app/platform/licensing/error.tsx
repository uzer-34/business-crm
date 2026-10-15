"use client";

import { AlertCircle } from "lucide-react";

export default function PlatformLicensingError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-3xl items-center justify-center px-4 py-12 sm:px-6">
      <section role="alert" className="w-full rounded-xl border border-danger/30 bg-surface p-6 text-center shadow-raised sm:p-9">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-danger-subtle text-danger">
          <AlertCircle className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Licensing records couldn’t be loaded</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground-muted">
          The request or its audit record failed. No licensing changes were made. Try loading the records again.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
