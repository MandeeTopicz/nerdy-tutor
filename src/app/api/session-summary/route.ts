import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export type SessionSummaryResponse = {
  studentName: string;
  grade: string;
  subject: string;
  topic: string;
  duration: string;
  topicsCovered: string[];
  comprehensionLevel: "Beginning" | "Developing" | "Proficient" | "Advanced";
  comprehensionNotes: string;
  questionsAsked: string[];
  misconceptions: string[];
  strengths: string[];
  suggestedNextTopics: string[];
  encouragementMessage: string;
};

const SYSTEM_PROMPT = `You are NerdyTutor's session analyzer. Given a tutoring session transcript and context, return a JSON summary with exactly these fields (no markdown, no preamble):
{
  "studentName": "string — student's name from context or transcript",
  "grade": "string — e.g. 7th",
  "subject": "string — MATH, SCIENCE, or ENGLISH",
  "topic": "string — e.g. fractions",
  "duration": "string — formatted e.g. '4 minutes 32 seconds'",
  "topicsCovered": ["array of specific concepts discussed"],
  "comprehensionLevel": "Beginning" | "Developing" | "Proficient" | "Advanced",
  "comprehensionNotes": "2-3 sentence explanation of comprehension assessment",
  "questionsAsked": ["list of questions the student asked"],
  "misconceptions": ["any misconceptions the student had that were corrected — empty array if none"],
  "strengths": ["what the student did well"],
  "suggestedNextTopics": ["exactly 3 recommended topics to study next"],
  "encouragementMessage": "one warm personalized message to the student by name"
}
Return only valid JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transcript,
      studentName,
      grade,
      subject,
      topic,
      durationSeconds,
    } = body as {
      transcript: string;
      studentName?: string;
      grade?: string;
      subject?: string;
      topic?: string;
      durationSeconds?: number;
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[session-summary] Missing ANTHROPIC_API_KEY");
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const context = [
      studentName ? `Student name: ${studentName}` : "",
      grade ? `Grade: ${grade}` : "",
      subject ? `Subject: ${subject}` : "",
      topic ? `Topic: ${topic}` : "",
      durationSeconds != null ? `Session duration: ${durationSeconds} seconds` : "",
    ]
      .filter(Boolean)
      .join(". ");

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${context ? context + "\n\n" : ""}Transcript:\n\n${transcript || "(No conversation recorded)"}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text"
        ? (response.content[0] as { type: "text"; text: string }).text
        : "";
    const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```\s*$/i, "");
    const data = JSON.parse(trimmed) as SessionSummaryResponse;

    return NextResponse.json(data);
  } catch (error) {
    console.error("[session-summary] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
