import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIONS, RESOURCES, type Action, type Resource } from "@/lib/permissions";

interface PermissionGrant {
  page: Resource;
  action: Action;
}

interface UpdateRoleBody {
  name?: string;
  permissions?: PermissionGrant[];
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };

  const { data: profile } = await supabase
    .from("users")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: "forbidden" as const, status: 403 };
  }
  return { profile };
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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: role, error: roleErr } = await admin
    .from("roles")
    .select("id, name, is_system, created_at")
    .eq("id", id)
    .single();
  if (roleErr || !role) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { data: grants } = await admin
    .from("role_permissions")
    .select("page, action")
    .eq("role_id", id);

  return NextResponse.json({ ok: true, role, permissions: grants ?? [] });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;

  let body: UpdateRoleBody;
  try {
    body = (await request.json()) as UpdateRoleBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("roles")
    .select("id, is_system")
    .eq("id", id)
    .single();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (existing.is_system) {
    return NextResponse.json({ ok: false, error: "system_role_immutable" }, { status: 403 });
  }

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed.length < 2) {
      return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
    }
    const { error: nameErr } = await admin
      .from("roles")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (nameErr) {
      const status = nameErr.code === "23505" ? 409 : 500;
      return NextResponse.json({ ok: false, error: nameErr.message }, { status });
    }
  }

  if (Array.isArray(body.permissions)) {
    if (!body.permissions.every(isValidGrant)) {
      return NextResponse.json({ ok: false, error: "invalid_permissions" }, { status: 400 });
    }
    const { error: delErr } = await admin
      .from("role_permissions")
      .delete()
      .eq("role_id", id);
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
    if (body.permissions.length > 0) {
      const rows = body.permissions.map((p) => ({
        role_id: id,
        page: p.page,
        action: p.action,
      }));
      const { error: insErr } = await admin.from("role_permissions").insert(rows);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("roles")
    .select("id, is_system")
    .eq("id", id)
    .single();
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (existing.is_system) {
    return NextResponse.json({ ok: false, error: "system_role_immutable" }, { status: 403 });
  }

  const { count } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "users_assigned", count },
      { status: 409 }
    );
  }

  const { error: delErr } = await admin.from("roles").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
