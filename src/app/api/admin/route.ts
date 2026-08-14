import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setRole } from "@/lib/admin";

export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  UNKNOWN_ROLE: 400,
  USER_NOT_FOUND: 404,
  LAST_ADMIN: 409,
};

/** POST /api/admin  { action: "set_role", user_id, role } */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.action !== "set_role") {
    return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  }

  // Себя разжаловать нельзя даже при наличии других админов: это почти всегда
  // промах по строке в таблице, а последствие — потеря доступа к этой же
  // странице, с которой промах и сделан.
  if (body.user_id === user.id) {
    return NextResponse.json({ error: "SELF_DEMOTE" }, { status: 409 });
  }

  const problem = await setRole(String(body.user_id), String(body.role));
  if (problem) {
    return NextResponse.json({ error: problem }, { status: ERROR_STATUS[problem] ?? 400 });
  }

  return NextResponse.json({ ok: true });
}
