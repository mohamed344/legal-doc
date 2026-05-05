import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api/require-admin";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (id === auth.profile.id) {
    return NextResponse.json({ ok: false, error: "cannot_edit_self" }, { status: 400 });
  }

  let body: { role_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.role_id !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_role_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: target }, { data: nextRole }] = await Promise.all([
    admin
      .from("users")
      .select("id, roles!users_role_id_fkey(is_admin)")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("roles")
      .select("id, is_admin")
      .eq("id", body.role_id)
      .maybeSingle(),
  ]);

  if (!target) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }
  if (!nextRole) {
    return NextResponse.json({ ok: false, error: "role_not_found" }, { status: 404 });
  }

  const targetIsAdmin =
    (target as unknown as { roles?: { is_admin: boolean } | null } | null)?.roles?.is_admin ?? false;
  if (targetIsAdmin) {
    return NextResponse.json({ ok: false, error: "cannot_modify_admin" }, { status: 403 });
  }
  if (nextRole.is_admin) {
    return NextResponse.json({ ok: false, error: "cannot_assign_admin_role" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("users")
    .update({ role_id: body.role_id })
    .eq("id", id)
    .select(
      "id, user_id, full_name, phone, email, avatar_url, last_login_at, role_id, is_active, created_at, roles!users_role_id_fkey(name, is_admin)"
    )
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, user: updated });
}
