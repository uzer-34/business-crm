"use client";

type PermissionOption = { key: string; category: string; description: string };

export function PermissionChecklist({
  options,
  selected,
  onChange,
}: {
  options: PermissionOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const byCategory = new Map<string, PermissionOption[]>();
  for (const opt of options) {
    const list = byCategory.get(opt.category) ?? [];
    list.push(opt);
    byCategory.set(opt.category, list);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[...byCategory.entries()].map(([category, opts]) => (
        <div key={category} className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{category}</p>
          {opts.map((opt) => (
            <label key={opt.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.includes(opt.key)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, opt.key] : selected.filter((k) => k !== opt.key))
                }
              />
              <span>{opt.description}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
