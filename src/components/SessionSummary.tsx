"use client";

import { Check, Info, Star } from "lucide-react";

export type SessionSummaryData = {
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

const COMPREHENSION_COLORS: Record<string, string> = {
  Beginning: "from-rose-500/20 to-coral-500/20 border-rose-400/50 text-rose-300",
  Developing: "from-amber-500/20 to-orange-500/20 border-amber-400/50 text-amber-300",
  Proficient: "from-teal-500/20 to-cyan-500/20 border-teal-400/50 text-teal-300",
  Advanced: "from-emerald-500/20 to-green-500/20 border-emerald-400/50 text-emerald-300",
};

const CARD_STYLE = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5";

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={CARD_STYLE}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-teal-400">{title}</h3>
      {children}
    </div>
  );
}

export function SessionSummary({
  data,
  onStudyAgain,
  onNewTopic,
}: {
  data: SessionSummaryData;
  onStudyAgain: () => void;
  onNewTopic: () => void;
}) {
  const colorClass = COMPREHENSION_COLORS[data.comprehensionLevel] ?? COMPREHENSION_COLORS.Proficient;

  return (
    <div className="flex min-h-screen flex-col overflow-y-auto bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440] font-sans">
      <header className="shrink-0 border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-medium lowercase tracking-tight text-white">nerdy</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Great session, {data.studentName || "there"}!
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-neutral-300">
                {data.grade}
              </span>
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-neutral-300">
                {data.subject}
              </span>
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-neutral-300">
                {data.topic}
              </span>
              <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-sm text-neutral-300">
                {data.duration}
              </span>
            </div>
          </div>

          {/* Comprehension */}
          <SummaryCard title="Comprehension">
            <div className={`rounded-xl border bg-gradient-to-br p-4 ${colorClass}`}>
              <div className="text-xl font-semibold">{data.comprehensionLevel}</div>
              <p className="mt-2 text-sm text-neutral-200">{data.comprehensionNotes}</p>
            </div>
          </SummaryCard>

          {/* Topics Covered */}
          <SummaryCard title="Topics Covered">
            <ul className="space-y-2">
              {data.topicsCovered.map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-neutral-200">
                  <Check className="h-4 w-4 shrink-0 text-teal-400" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </SummaryCard>

          {/* Questions Asked */}
          <SummaryCard title="Questions You Asked">
            <ul className="space-y-2">
              {data.questionsAsked.map((q, i) => (
                <li key={i} className="text-neutral-200">• {q}</li>
              ))}
            </ul>
          </SummaryCard>

          {/* Strengths */}
          <SummaryCard title="Strengths">
            <ul className="space-y-2">
              {data.strengths.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-neutral-200">
                  <Star className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </SummaryCard>

          {/* Misconceptions (only if not empty) */}
          {data.misconceptions.length > 0 && (
            <SummaryCard title="Misconceptions Corrected">
              <ul className="space-y-2">
                {data.misconceptions.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-neutral-200">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </SummaryCard>
          )}

          {/* Suggested Next Topics */}
          <SummaryCard title="Suggested Next Topics">
            <ul className="space-y-3">
              {data.suggestedNextTopics.map((topic, i) => (
                <li key={i}>
                  <div className="flex w-full items-center rounded-lg border border-teal-400/30 bg-teal-400/5 px-4 py-3 text-teal-200">
                    <span>{topic}</span>
                  </div>
                </li>
              ))}
            </ul>
          </SummaryCard>

          {/* Encouragement */}
          <div className={`${CARD_STYLE} border-teal-400/30 bg-teal-400/5`}>
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-2xl">
                🧑‍🏫
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-400">
                  From Nerd
                </h3>
                <p className="text-neutral-100">{data.encouragementMessage}</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/10 px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={onStudyAgain}
            className="rounded-full bg-[#00d4c8] px-6 py-3 font-medium text-[#0f1129] transition hover:bg-[#22d3ee]"
          >
            Study Again
          </button>
          <button
            type="button"
            onClick={onNewTopic}
            className="rounded-full border border-white/30 bg-white/5 px-6 py-3 font-medium text-white transition hover:bg-white/10"
          >
            New Topic
          </button>
        </div>
      </footer>
    </div>
  );
}
