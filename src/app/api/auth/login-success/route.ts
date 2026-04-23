import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/lib/supabase/types";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json(
      { ok: false, error: "missing_public_row" },
      { status: 409 }
    );
  }

  const { data: updated, error: updateErr } = await admin
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", row.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ ok: true, user: row as AppUser });
  }

  return NextResponse.json({ ok: true, user: updated as AppUser });
}
