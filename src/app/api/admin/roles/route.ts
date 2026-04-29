import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIONS, RESOURCES, type Action, type Resource } from "@/lib/permissions";

interface PermissionGrant {
  page: Resource;
  action: Action;
}

interface CreateRoleBody {
  name: string;
  permissions: PermissionGrant[];
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };

  const { data: profile } = await supabase
    .from("users")
    .select("id, roles(is_admin)")
    .eq("user_id", user.id)
    .single();

  const linked = (profile as { roles?: { is_admin: boolean } | null } | null)?.roles ?? null;
  if (!profile || !linked?.is_admin) {
    return { error: "forbidden" as const, status: 403 };
  }
  return { profile: { id: (profile as { id: string }).id } };
}

function isValidGrant(g: unknown): g is PermissionGrant {
  if (!g || typeof g !== "object") return false;
  const obj = g as { page?: unknown; action?: unknown };
  return (
    typeof obj.page === "string" &&
    typeof obj.action === "string" &&
    (RESOURCES as readonly string[]).includes(obj.page) &&
    (ACTIONS as readonly string[]).includes(obj.action)
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();

  const { data: roles, error: rolesErr } = await admin
    .from("roles")
    .select("id, name, is_system, is_admin, created_at")
    .order("is_admin", { ascending: false })
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });
  if (rolesErr) {
    return NextResponse.json({ ok: false, error: rolesErr.message }, { status: 500 });
  }

  const ids = (roles ?? []).map((r) => r.id);
  const grantCounts: Record<string, number> = {};
  const userCounts: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: grants } = await admin
      .from("role_permissions")
      .select("role_id")
      .in("role_id", ids);
    for (const g of grants ?? []) {
      grantCounts[g.role_id] = (grantCounts[g.role_id] ?? 0) + 1;
    }

    const { data: users } = await admin
      .from("users")
      .select("role_id")
      .in("role_id", ids);
    for (const u of users ?? []) {
      if (u.role_id) userCounts[u.role_id] = (userCounts[u.role_id] ?? 0) + 1;
    }
  }

  const out = (roles ?? []).map((r) => ({
    ...r,
    grant_count: grantCounts[r.id] ?? 0,
    user_count: userCounts[r.id] ?? 0,
  }));
  return NextResponse.json({ ok: true, roles: out });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: CreateRoleBody;
  try {
    body = (await request.json()) as CreateRoleBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }
  if (!Array.isArray(body.permissions) || !body.permissions.every(isValidGrant)) {
    return NextResponse.json({ ok: false, error: "invalid_permissions" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: role, error: insertErr } = await admin
    .from("roles")
    .insert({ name, is_system: false, is_admin: false, created_by: auth.profile.id })
    .select("id, name, is_system, is_admin, created_at")
    .single();

  if (insertErr || !role) {
    const msg = insertErr?.message ?? "create_failed";
    const status = insertErr?.code === "23505" ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  if (body.permissions.length > 0) {
    const rows = body.permissions.map((p) => ({
      role_id: role.id,
      page: p.page,
      action: p.action,
    }));
    const { error: grantsErr } = await admin.from("role_permissions").insert(rows);
    if (grantsErr) {
      await admin.from("roles").delete().eq("id", role.id);
      return NextResponse.json({ ok: false, error: grantsErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, role });
}
