import type { Role } from "./supabase/types";

export const RESOURCES = [
  "templates",
  "documents",
  "clients",
  "invoices",
  "employees",
  "settings",
  "ai_import",
  "upload",
  "archives",
] as const;

export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ["read", "create", "update", "delete"] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, Record<Resource, Action[]>> = {
  admin: {
    templates: ["read", "create", "update", "delete"],
    documents: ["read", "create", "update", "delete"],
    clients: ["read", "create", "update", "delete"],
    invoices: ["read", "create", "update", "delete"],
    employees: ["read", "create", "update", "delete"],
    settings: ["read", "update"],
    ai_import: ["read", "create"],
    upload: ["read", "create"],
    archives: ["read", "update", "delete"],
  },
  employe: {
    templates: ["read"],
    documents: ["read", "create"],
    clients: ["read"],
    invoices: [],
    employees: [],
    settings: [],
    ai_import: [],
    upload: ["read", "create"],
    archives: [],
  },
};

export function can(role: Role | undefined | null, resource: Resource, action: Action): boolean {
  if (!role) return false;
  return MATRIX[role][resource]?.includes(action) ?? false;
}

export function allowedResources(role: Role | undefined | null): Resource[] {
  if (!role) return [];
  return (Object.keys(MATRIX[role]) as Resource[]).filter(
    (r) => MATRIX[role][r].length > 0
  );
}
