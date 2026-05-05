import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RequireAdminResult =
  | { error: "unauthenticated"; status: 401 }
  | { error: "forbidden"; status: 403 }
  | { profile: { id: string } };

export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: getUserErr,
  } = await supabase.auth.getUser();
  if (getUserErr) {
    console.error("[requireAdmin] auth.getUser error:", getUserErr.message);
  }
  if (!user) {
    return { error: "unauthenticated", status: 401 };
  }

  // Use the service-role client to look up the caller — RLS policies that
  // mask the row from the public client would otherwise produce a misleading
  // 403 for a perfectly-good admin.
  const admin = createAdminClient();
  const { data: callerProfile, error: profileErr } = await admin
    .from("users")
    .select("id, roles!users_role_id_fkey(is_admin)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[requireAdmin] profile lookup error:", profileErr.message);
  }

  const linked =
    (callerProfile as unknown as { roles?: { is_admin: boolean } | null } | null)?.roles ?? null;
  if (!callerProfile || !linked?.is_admin) {
    return { error: "forbidden", status: 403 };
  }
  return { profile: { id: (callerProfile as { id: string }).id } };
}
