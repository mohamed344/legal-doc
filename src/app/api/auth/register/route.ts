import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RegisterBody {
  email: string;
  password: string;
  full_name: string;
  emailRedirectTo?: string;
}

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.email || !body.password || !body.full_name) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ ok: false, error: "weak_password" }, { status: 400 });
  }
  if (body.full_name.trim().length < 2) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: {
      data: { full_name: body.full_name },
      emailRedirectTo: body.emailRedirectTo,
    },
  });

  if (error || !data.user) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "signup_failed" },
      { status: 400 }
    );
  }

  const authUserId = data.user.id;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();

  if (!existing) {
    const { count } = await admin
      .from("users")
      .select("id", { count: "exact", head: true });
    const role = (count ?? 0) === 0 ? "admin" : "employe";

    const { error: insertErr } = await admin.from("users").insert({
      user_id: authUserId,
      full_name: body.full_name,
      email: body.email,
      role,
      is_active: true,
    });

    if (insertErr) {
      await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json(
        { ok: false, error: insertErr.message ?? "public_row_insert_failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, userId: authUserId });
}
