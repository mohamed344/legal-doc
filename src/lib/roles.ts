import type { Role } from "./supabase/types";

export const ROLES: { value: Role; labelFr: string; labelAr: string }[] = [
  { value: "admin", labelFr: "Administrateur", labelAr: "مسؤول" },
  { value: "employe", labelFr: "Employé", labelAr: "موظف" },
];

export function roleLabel(role: Role, locale: "fr" | "ar" = "fr") {
  const entry = ROLES.find((r) => r.value === role);
  if (!entry) return role;
  return locale === "ar" ? entry.labelAr : entry.labelFr;
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 2,
  employe: 1,
};

export function hasAtLeast(userRole: Role | undefined | null, required: Role): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}
