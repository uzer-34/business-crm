type ActivityLike = { type: string; metadata: unknown };

export function summarizeActivity(activity: ActivityLike): string {
  const metadata = (activity.metadata ?? {}) as Record<string, unknown>;

  switch (activity.type) {
    case "customer.created":
      return "Customer created";
    case "customer.assigned":
      return metadata.assignedToId ? "Customer reassigned" : "Customer unassigned";
    case "note.added":
      return "Note added";
    case "task.created":
      return `Task created: ${typeof metadata.title === "string" ? metadata.title : ""}`;
    case "task.completed":
      return `Task completed: ${typeof metadata.title === "string" ? metadata.title : ""}`;
    default:
      return activity.type;
  }
}
