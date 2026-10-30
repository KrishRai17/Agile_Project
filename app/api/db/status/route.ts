import { NextResponse } from "next/server";
import { getDatabaseStats } from "@/lib/db";

/**
 * GET /api/db/status — Returns SQLite database health and table row counts.
 */
export async function GET() {
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
