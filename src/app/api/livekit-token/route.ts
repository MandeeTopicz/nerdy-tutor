import { NextRequest, NextResponse } from "next/server";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomServiceClient,
} from "livekit-server-sdk";

const AGENT_NAME = "tutor";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomName = searchParams.get("room") ?? "tutor-" + Date.now();
    const participantName = searchParams.get("participant") ?? "student";
    const grade = searchParams.get("grade") ?? "8th";
    const subject = searchParams.get("subject") ?? "fractions";

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 }
      );
    }
    if (!livekitUrl) {
      return NextResponse.json(
        { error: "LIVEKIT_URL not configured" },
        { status: 500 }
      );
    }

    const roomMetadata = JSON.stringify({ grade, subject });
    const roomSvc = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
    await roomSvc.createRoom({
      name: roomName,
      metadata: roomMetadata,
      emptyTimeout: 60,
      departureTimeout: 30,
      agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })],
    });

    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
      ttl: "1h",
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    return NextResponse.json({ token: jwt });
  } catch (error) {
    console.error("LiveKit token error:", error);
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    );
  }
}
