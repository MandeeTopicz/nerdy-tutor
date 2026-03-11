import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT_BASE = `You are NerdyTutor's session analyzer. Given this tutoring session transcript, provide a structured JSON summary with exactly these fields:
{
  "topic": "string — what subject was covered",
  "grade": "string — grade level",
  "whatWasLearned": ["array of 2-4 short bullet strings"],
  "strongPoints": ["array of 2-3 short bullet strings about what the student did well"],
  "areasForImprovement": ["array of 2-3 short bullet strings about what to work on"],
  "encouragement": "one warm encouraging sentence to end on"
}
Return only valid JSON, no markdown, no preamble.`;

function buildSystemPrompt(timedOut?: boolean): string {
  const note = timedOut
    ? "\n\nNote: the session timed out due to student inactivity. Still summarize what the tutor covered."
    : "";
  return SYSTEM_PROMPT_BASE + note;
}

export type SessionSummaryData = {
  topic: string;
  grade: string;
  whatWasLearned: string[];
  strongPoints: string[];
  areasForImprovement: string[];
  encouragement: string;
  timedOut?: boolean;
  noResponse?: boolean;
};

function formatTranscript(messages: { role: string; text: string }[]): string {
  return messages
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, subject, grade, timedOut, noResponse } = body as {
      messages: { role: string; text: string }[];
      subject?: string;
      grade?: string;
      timedOut?: boolean;
      noResponse?: boolean;
    };

    console.log("[session-summary] called with", {
      messageCount: messages?.length,
      timedOut,
      noResponse,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[session-summary] Missing ANTHROPIC_API_KEY");
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages array required" },
        { status: 400 }
      );
    }

    // No-response fallback only when backend explicitly sent noResponse (60s timeout + student never spoke)
    if (timedOut && noResponse) {
      return NextResponse.json({
        topic: subject || "Unknown",
        grade: grade || "Unknown",
        whatWasLearned: [],
        strongPoints: [],
        areasForImprovement: [],
        encouragement: "",
        timedOut: true,
        noResponse: true,
      });
    }

    const transcript = formatTranscript(messages);
    const context = [
      subject ? `Subject context: ${subject}` : "",
      grade ? `Grade level context: ${grade}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: buildSystemPrompt(timedOut),
      messages: [
        {
          role: "user",
          content: `${context ? context + "\n\n" : ""}Tutoring session transcript:\n\n${transcript || "(No conversation recorded)"}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text"
        ? (response.content[0] as { type: "text"; text: string }).text
        : "";
    const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "");
    const data = JSON.parse(trimmed) as SessionSummaryData;
    if (timedOut) {
      data.timedOut = true;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[session-summary] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
