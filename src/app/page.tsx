"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { SessionEndMeta } from "@/components/TutorRoom";
import { Calculator, Leaf, Microscope } from "lucide-react";

type SessionSummaryData = {
  topic: string;
  grade: string;
  whatWasLearned: string[];
  strongPoints: string[];
  areasForImprovement: string[];
  encouragement: string;
  timedOut?: boolean;
  noResponse?: boolean;
};

const TutorRoom = dynamic(() => import("@/components/TutorRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1129] font-sans text-neutral-300">
      Loading…
    </div>
  ),
});

type TranscriptMessage = { role: "You" | "Tutor"; text: string };

const CONCEPTS = [
  {
    id: "fractions",
    title: "Fractions",
    grade: "6th grade",
    icon: Calculator,
    theme: "teal" as const,
  },
  {
    id: "cell-mitosis",
    title: "Cell Mitosis",
    grade: "9th grade",
    icon: Microscope,
    theme: "purple" as const,
  },
  {
    id: "photosynthesis",
    title: "Photosynthesis",
    grade: "7th grade",
    icon: Leaf,
    theme: "green" as const,
  },
];

const CARD_THEMES = {
  teal: {
    shadow: "shadow-[0_0_30px_rgba(0,212,200,0.08)]",
    shadowHover: "hover:shadow-[0_0_40px_rgba(0,212,200,0.18)]",
    borderHover: "hover:border-teal-400/40",
    badge: "bg-teal-400 text-[#0f1129] group-hover:bg-teal-400/80",
    iconContainer: "bg-teal-400/10 group-hover:bg-teal-400/20",
    icon: "text-teal-400",
  },
  purple: {
    shadow: "shadow-[0_0_30px_rgba(168,85,247,0.08)]",
    shadowHover: "hover:shadow-[0_0_40px_rgba(168,85,247,0.18)]",
    borderHover: "hover:border-purple-400/40",
    badge: "bg-purple-400 text-white group-hover:bg-purple-400/80",
    iconContainer: "bg-purple-400/10 group-hover:bg-purple-400/20",
    icon: "text-purple-400",
  },
  green: {
    shadow: "shadow-[0_0_30px_rgba(74,222,128,0.08)]",
    shadowHover: "hover:shadow-[0_0_40px_rgba(74,222,128,0.18)]",
    borderHover: "hover:border-green-400/40",
    badge: "bg-green-400 text-[#0f1129] group-hover:bg-green-400/80",
    iconContainer: "bg-green-400/10 group-hover:bg-green-400/20",
    icon: "text-green-400",
  },
};

const STATS = ["< 1s response", "Socratic method", "Real-time video"];

const PARTNERS = ["Deepgram", "Groq", "Cartesia", "Simli"];

const LANDING_BG = "bg-[#0f1129]";
const LANDING_GRADIENT = "bg-gradient-to-b from-[#0f1129] to-[#1a1440]";

const GRADE_OPTIONS = ["6th", "8th", "10th"] as const;

function Landing({
  grade,
  setGrade,
  subject,
  setSubject,
  onStartSession,
}: {
  grade: string;
  setGrade: (g: string) => void;
  subject: string | null;
  setSubject: (s: string) => void;
  onStartSession: () => void;
}) {
  return (
    <div className={`flex min-h-screen flex-col font-sans ${LANDING_BG} ${LANDING_GRADIENT}`}>
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-medium lowercase tracking-tight text-white">
          nerdy
        </h1>
        <nav className="flex items-center gap-6 text-sm text-neutral-300">
          <a href="#" className="font-medium text-white">NerdyTutor</a>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <section className="mb-12 max-w-2xl text-center">
          <h2 className="mb-3 bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#22d3ee] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            NerdyTutor
          </h2>
          <p className="mb-4 font-serif text-xl italic text-neutral-300 sm:text-2xl">
            The AI Video Tutor
          </p>
          <p className="text-lg text-neutral-300">
            Real-time AI tutoring using the Socratic method — ask questions, guide discovery, build understanding.
          </p>
        </section>

        <p className="text-neutral-400 text-sm text-center mb-3">Choose a topic to explore</p>
        <section className="mb-12 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {CONCEPTS.map((concept) => {
            const Icon = concept.icon;
            const t = CARD_THEMES[concept.theme];
            const isSelected = subject === concept.id;
            return (
              <button
                key={concept.id}
                type="button"
                onClick={() => setSubject(concept.id)}
                className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 ${
                  isSelected
                    ? "border-teal-400/40 bg-teal-400/10"
                    : `border-white/10 bg-white/5 hover:bg-white/10 ${t.borderHover}`
                } ${t.shadow} ${t.shadowHover}`}
              >
                <span className={`absolute right-3 top-3 rounded px-2 py-0.5 text-xs font-medium ${t.badge}`}>
                  NEW
                </span>
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl p-2 transition-colors duration-300 ${t.iconContainer}`}>
                  <Icon className={t.icon} size={20} />
                </div>
                <h3 className="font-semibold text-white">{concept.title}</h3>
                <p className="text-sm text-neutral-400">{concept.grade}</p>
              </button>
            );
          })}
        </section>

        <p className="text-neutral-400 text-sm text-center mb-3">Select your grade level</p>
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {GRADE_OPTIONS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrade(g)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                grade === g
                  ? "border-teal-400/40 bg-teal-400/20 text-teal-300"
                  : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
              }`}
            >
              {g} Grade
            </button>
          ))}
        </div>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-8 text-sm text-neutral-400">
          {STATS.map((stat) => (
            <span key={stat}>{stat}</span>
          ))}
        </div>

        <button
          type="button"
          onClick={onStartSession}
          disabled={!subject}
          className="rounded-full bg-[#00d4c8] px-8 py-3.5 font-semibold text-[#0f1129] shadow-lg transition hover:bg-[#22d3ee] hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Session →
        </button>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-2 text-sm text-neutral-500">
          <span>Powered by</span>
          <span>{PARTNERS.join(" · ")}</span>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [inSession, setInSession] = useState(false);
  const [grade, setGrade] = useState<string>("8th");
  const [subject, setSubject] = useState<string | null>("fractions");
  const [summary, setSummary] = useState<{
    grade: string;
    subject: string;
    messages: TranscriptMessage[];
    meta?: SessionEndMeta;
  } | null>(null);

  const handleEnd = (messages?: TranscriptMessage[], meta?: SessionEndMeta) => {
    if (subject && messages !== undefined) {
      setSummary({
        grade,
        subject: CONCEPTS.find((c) => c.id === subject)?.title ?? subject,
        messages: messages ?? [],
        meta,
      });
    }
    setInSession(false);
  };

  if (summary) {
    return (
      <SessionSummary
        grade={summary.grade}
        subject={summary.subject}
        messages={summary.messages}
        meta={summary.meta}
        onStartNew={() => setSummary(null)}
        onBackToHome={() => setSummary(null)}
      />
    );
  }

  if (!inSession) {
    return (
      <Landing
        grade={grade}
        setGrade={setGrade}
        subject={subject}
        setSubject={(s) => setSubject(s)}
        onStartSession={() => setInSession(true)}
      />
    );
  }

  return (
    <TutorRoom
      autoConnect
      grade={grade}
      subject={subject ?? "fractions"}
      onEnd={(msgs, meta) => handleEnd(msgs, meta)}
    />
  );
}

function SessionSummary({
  grade,
  subject,
  messages,
  meta,
  onStartNew,
  onBackToHome,
}: {
  grade: string;
  subject: string;
  messages: TranscriptMessage[];
  meta?: SessionEndMeta;
  onStartNew: () => void;
  onBackToHome: () => void;
}) {
  const [data, setData] = useState<SessionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            subject,
            grade,
            timedOut: meta?.timedOut,
            noResponse: Boolean(meta?.timedOut && meta?.everResponded === false),
          }),
        });
        if (cancelled) return;
        if (!res.ok) throw new Error("Failed to generate summary");
        const parsed = (await res.json()) as SessionSummaryData;
        setData(parsed);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, subject, grade, meta]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440] px-8 py-12 font-sans"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div className="mx-auto w-full max-w-2xl px-8 py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-8 py-16 backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400/40 border-t-teal-400" />
            <p className="text-neutral-400">Generating your session summary...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-6 flex flex-col items-center justify-center gap-3 text-center">
              <span className="text-4xl text-amber-400">⚠</span>
              <h2 className="bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#22d3ee] bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Session Ended
              </h2>
              <p className="max-w-md text-neutral-300">
                The session ended unexpectedly. You can try again whenever you&apos;re ready.
              </p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onStartNew}
                className="rounded-full bg-[#00d4c8] px-8 py-3 font-semibold text-[#0f1129] transition hover:bg-[#22d3ee]"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : data?.timedOut && data?.noResponse ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            <div className="mb-6 flex flex-col items-center justify-center gap-3 text-center">
              <span className="text-4xl text-amber-400">⚠</span>
              <h2 className="bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#22d3ee] bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Session Timed Out
              </h2>
              <p className="max-w-md text-neutral-300">
                We didn&apos;t receive a response during this session. This can happen if your microphone wasn&apos;t picked up or the connection dropped.
              </p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onStartNew}
                className="rounded-full bg-[#00d4c8] px-8 py-3 font-semibold text-[#0f1129] transition hover:bg-[#22d3ee]"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : data ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
            {data.timedOut && !data.noResponse && (
              <div className="mb-6 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-300">
                Session ended due to inactivity — here&apos;s a summary of what was covered.
              </div>
            )}
            <div className="mb-6 flex items-center justify-center gap-3">
              <span className="text-4xl text-green-400">✓</span>
              <h2 className="bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#22d3ee] bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                Session Complete
              </h2>
            </div>
            <div className="mb-8 flex flex-wrap justify-center gap-2">
              <span className="rounded-full bg-teal-400/10 px-3 py-1 text-sm text-teal-300">
                {data.topic}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-neutral-300">
                {data.grade} grade
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-teal-400/20 bg-teal-400/5 p-4">
                <h3 className="mb-3 text-sm font-semibold text-teal-300">What You Learned</h3>
                <ul className="space-y-1.5 text-sm text-neutral-300">
                  {data.whatWasLearned.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-teal-400">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-4">
                <h3 className="mb-3 text-sm font-semibold text-green-300">Strong Points</h3>
                <ul className="space-y-1.5 text-sm text-green-300">
                  {data.strongPoints.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                <h3 className="mb-3 text-sm font-semibold text-yellow-300">Areas to Explore More</h3>
                <ul className="space-y-1.5 text-sm text-yellow-300">
                  {data.areasForImprovement.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span>→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <blockquote className="mt-6 border-t border-white/10 pt-6 text-center text-lg italic text-neutral-300">
              {data.encouragement}
            </blockquote>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={onBackToHome}
                className="rounded-full border border-white/20 px-6 py-3 font-medium text-neutral-300 transition hover:bg-white/5"
              >
                Back to Home
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
