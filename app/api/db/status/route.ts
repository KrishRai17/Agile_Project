import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { requireUser } from "@/lib/apiAuth";
import { getDatabaseStats } from "@/lib/db";

/**
 * GET /api/db/status — Returns SQLite database health and table row counts.
 * Requires a signed-in user and never exposes the absolute filesystem path.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const adminSecret = process.env.ADMIN_SECRET;
    const provided = req.headers.get("x-admin-secret");
    if (!adminSecret || !provided) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const a = createHash("sha256").update(adminSecret.trim()).digest();
    const b = createHash("sha256").update(provided.trim()).digest();
    if (!timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }

  const auth = requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    const stats = getDatabaseStats();
    return NextResponse.json({
      ok: true,
      ...stats,
    });
  } catch (error) {
    console.error("Database status error:", error);
    return NextResponse.json(
      { ok: false, error: "Database status check failed." },
      { status: 500 }
    );
  }
}
