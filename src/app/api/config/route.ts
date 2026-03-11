import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

function getLivekitUrlFromEnvFile(): string | null {
  try {
    const path = join(process.cwd(), ".env.local");
    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("LIVEKIT_URL=")) {
        const value = trimmed.slice("LIVEKIT_URL=".length).trim();
        return value || null;
      }
    }
  } catch {
    // .env.local missing or unreadable
  }
  return null;
}

export async function GET() {
  let livekitUrl: string | null | undefined =
    process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!livekitUrl) {
    livekitUrl = getLivekitUrlFromEnvFile();
  }
  if (!livekitUrl) {
    return NextResponse.json(
      { error: "LIVEKIT_URL not set in .env.local" },
      { status: 500 }
    );
  }
  return NextResponse.json({ livekitUrl });
}
