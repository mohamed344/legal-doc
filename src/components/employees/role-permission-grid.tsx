"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { ACTIONS, RESOURCES, type Action, type Resource } from "@/lib/permissions";

export type GrantMap = Record<Resource, Set<Action>>;

export function emptyGrants(): GrantMap {
  return Object.fromEntries(RESOURCES.map((r) => [r, new Set<Action>()])) as GrantMap;
}

export function grantsToList(grants: GrantMap): { page: Resource; action: Action }[] {
  const out: { page: Resource; action: Action }[] = [];
  for (const r of RESOURCES) {
    for (const a of grants[r] ?? new Set()) {
      out.push({ page: r, action: a });
    }
  }
  return out;
}

export function listToGrants(list: { page: string; action: string }[]): GrantMap {
  const g = emptyGrants();
  for (const { page, action } of list) {
    if ((RESOURCES as readonly string[]).includes(page) && (ACTIONS as readonly string[]).includes(action)) {
      g[page as Resource].add(action as Action);
    }
  }
  return g;
}

interface Props {
  value: GrantMap;
  onChange: (next: GrantMap) => void;
  disabled?: boolean;
}

export function RolePermissionGrid({ value, onChange, disabled }: Props) {
  const t = useTranslations("employees.roles");

  const cloneAndUpdate = (updater: (g: GrantMap) => void) => {
    const next: GrantMap = Object.fromEntries(
      RESOURCES.map((r) => [r, new Set(value[r])])
    ) as GrantMap;
    updater(next);
    onChange(next);
  };

  const toggleCell = (page: Resource, action: Action) => {
    cloneAndUpdate((g) => {
      if (g[page].has(action)) g[page].delete(action);
      else g[page].add(action);
    });
  };

  const toggleRow = (page: Resource) => {
    cloneAndUpdate((g) => {
      const all = ACTIONS.every((a) => g[page].has(a));
      if (all) g[page].clear();
      else for (const a of ACTIONS) g[page].add(a);
    });
  };

  const toggleColumn = (action: Action) => {
    cloneAndUpdate((g) => {
      const all = RESOURCES.every((r) => g[r].has(action));
      for (const r of RESOURCES) {
        if (all) g[r].delete(action);
        else g[r].add(action);
      }
    });
  };

  const rowAll = (page: Resource) => ACTIONS.every((a) => value[page].has(a));
  const colAll = (action: Action) => RESOURCES.every((r) => value[r].has(action));

  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-start px-3 py-2 font-medium">{t("pageColumn")}</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-3 py-2 font-medium text-center">
                <label className="flex flex-col items-center gap-1 cursor-pointer">
                  <span>{t(`actions.${a}`)}</span>
                  <Checkbox
                    checked={colAll(a)}
                    onCheckedChange={() => toggleColumn(a)}
                    disabled={disabled}
                    aria-label={t(`actions.${a}`)}
                  />
                </label>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {RESOURCES.map((r) => (
            <tr key={r}>
              <td className="px-3 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={rowAll(r)}
                    onCheckedChange={() => toggleRow(r)}
                    disabled={disabled}
                    aria-label={t(`pages.${r}`)}
                  />
                  <span className="font-medium">{t(`pages.${r}`)}</span>
                </label>
              </td>
              {ACTIONS.map((a) => (
                <td key={a} className="px-3 py-2 text-center">
                  <Checkbox
                    checked={value[r].has(a)}
                    onCheckedChange={() => toggleCell(r, a)}
                    disabled={disabled}
                    aria-label={`${t(`pages.${r}`)} ${t(`actions.${a}`)}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
