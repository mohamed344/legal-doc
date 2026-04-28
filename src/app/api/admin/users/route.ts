import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateUserBody {
  full_name: string;
  email: string;
  password: string;
  role: "employe";
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
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: CreateUserBody;
  try {
    body = (await request.json()) as CreateUserBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.email || !body.password || !body.full_name || !body.role) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (body.role !== "employe") {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ ok: false, error: "weak_password" }, { status: 400 });
  }

  const admin = createAdminClient();

  let resolvedRoleId: string | null = null;
  if (body.role_id) {
    const { data: roleRow } = await admin
      .from("roles")
      .select("id")
      .eq("id", body.role_id)
      .single();
    if (!roleRow) {
      return NextResponse.json({ ok: false, error: "invalid_role_id" }, { status: 400 });
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

  // The handle_new_user trigger inserts a users row. Update it to reflect the admin's choices.
  const { data: updatedProfile, error: updateErr } = await admin
    .from("users")
    .update({
      role: body.role,
      is_active: body.is_active,
      full_name: body.full_name,
      email: body.email,
      role_id: resolvedRoleId,
    })
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
