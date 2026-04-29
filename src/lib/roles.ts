// Role labels are now stored as free-form names in public.roles, so the
// UI displays whatever the admin named the role. This module is kept as
// a tiny shim in case future code wants a localized label, but right
// now there is nothing static to translate.

export function roleLabel(name: string | null | undefined): string {
  return name?.trim() ? name : "—";
}
