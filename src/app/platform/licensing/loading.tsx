import { Skeleton } from "@/components/ui/feedback";

export default function PlatformLicensingLoading() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8 lg:py-9" aria-busy="true" aria-label="Loading licensing records">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="w-full space-y-3">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        <Skeleton className="h-16 w-56 max-w-full rounded-lg" />
      </div>
      <Skeleton className="mb-6 h-36 rounded-xl" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-44 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
