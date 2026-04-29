import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateUserBody {
  full_name: string;
  email: string;
  password: string;
  is_active: boolean;
  role_id?: string | null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("users")
    .select("id, roles(is_admin)")
    .eq("user_id", user.id)
    .single();

  const callerRole = (callerProfile as { roles?: { is_admin: boolean } | null } | null)?.roles ?? null;
  if (!callerProfile || !callerRole?.is_admin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: CreateUserBody;
  try {
    body = (await request.json()) as CreateUserBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.email || !body.password || !body.full_name) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ ok: false, error: "weak_password" }, { status: 400 });
  }

  const admin = createAdminClient();

  let resolvedRoleId: string | null = null;
  if (body.role_id) {
    const { data: roleRow } = await admin
      .from("roles")
      .select("id, is_admin")
      .eq("id", body.role_id)
      .single();
    if (!roleRow) {
      return NextResponse.json({ ok: false, error: "invalid_role_id" }, { status: 400 });
    }
    if (roleRow.is_admin) {
      // The form is for non-admin employees; refuse to silently mint another admin.
      return NextResponse.json({ ok: false, error: "cannot_assign_admin_role" }, { status: 400 });
    }
    resolvedRoleId = roleRow.id;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { ok: false, error: createErr?.message ?? "create_failed" },
      { status: 400 }
    );
  }

  const newUserId = created.user.id;

  // handle_new_user() seeds the row with role_id = Employé. Update with the
  // admin's choices (and override role_id only when one was explicitly picked).
  const updatePayload: Record<string, unknown> = {
    is_active: body.is_active,
    full_name: body.full_name,
    email: body.email,
  };
  if (resolvedRoleId) updatePayload.role_id = resolvedRoleId;

  const { data: updatedProfile, error: updateErr } = await admin
    .from("users")
    .update(updatePayload)
    .eq("user_id", newUserId)
    .select("id")
    .single();

  if (updateErr || !updatedProfile) {
    await admin.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { ok: false, error: updateErr?.message ?? "profile_update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, user_id: newUserId, users_row_id: updatedProfile.id });
}
