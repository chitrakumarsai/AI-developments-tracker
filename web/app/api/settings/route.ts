import { NextResponse } from "next/server";

import { saveSettings } from "@/lib/settings/persist";
import { normalizeSettings } from "@/lib/settings/normalize";

/**
 * POST /api/settings — persist the feed settings singleton. The body is
 * untrusted, so `normalizeSettings` clamps every field before it is stored
 * (§12.7). Phase 1: not user-scoped (single global row).
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: "Body must be JSON." },
      { status: 400 },
    );
  }

  const settings = normalizeSettings(raw);
  try {
    await saveSettings(settings);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
