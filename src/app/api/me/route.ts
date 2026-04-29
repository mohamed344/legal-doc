import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/lib/supabase/types";

export async function GET() {
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
    .select("*, roles(name, is_admin)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json(
      { ok: false, error: "missing_public_row" },
      { status: 404 }
    );
  }

  const linked = (row as { roles?: { name: string; is_admin: boolean } | null }).roles ?? null;
  const me: AppUser = {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    avatar_url: row.avatar_url,
    last_login_at: row.last_login_at,
    role_id: row.role_id,
    role_name: linked?.name ?? null,
    is_admin: linked?.is_admin ?? false,
    is_active: row.is_active,
    created_at: row.created_at,
  };

  return NextResponse.json({ ok: true, user: me });
}
