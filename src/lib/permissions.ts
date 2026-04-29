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
