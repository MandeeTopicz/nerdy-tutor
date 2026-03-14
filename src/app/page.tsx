"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Calculator, Leaf, Microscope } from "lucide-react";
import { SessionSummary, type SessionSummaryData } from "@/components/SessionSummary";
import type { TranscriptEntry } from "@/components/TutorRoom";

const TutorRoom = dynamic(() => import("@/components/TutorRoom"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1129] font-sans text-neutral-300">
      Loading…
    </div>
  ),
});

const CONCEPTS = [
  {
    id: "fractions",
    title: "Fractions",
    icon: Calculator,
    theme: "teal" as const,
  },
  {
    id: "cell-mitosis",
    title: "Cell Mitosis",
    icon: Microscope,
    theme: "purple" as const,
  },
  {
    id: "photosynthesis",
    title: "Photosynthesis",
    icon: Leaf,
    theme: "green" as const,
  },
];

const GRADES = [6, 7, 8, 9, 10, 11, 12] as const;
function gradeToLabel(g: number) {
  const ordinals: Record<number, string> = {
    6: "6th", 7: "7th", 8: "8th", 9: "9th", 10: "10th", 11: "11th", 12: "12th",
  };
  return ordinals[g] ?? `${g}th`;
}

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

const DEFAULT_GRADE = "8th";

const TOPIC_TO_SUBJECT: Record<string, string> = {
  fractions: "MATH",
  "cell-mitosis": "SCIENCE",
  photosynthesis: "SCIENCE",
};

function Landing({
  subject,
  setSubject,
  grade,
  setGrade,
  onStartSession,
}: {
  subject: string | null;
  setSubject: (s: string) => void;
  grade: string | null;
  setGrade: (g: string) => void;
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
        <section className="mb-10 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
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
              </button>
            );
          })}
        </section>

        <p className="text-neutral-400 text-sm text-center mb-2">What grade are you in?</p>
        <section className="mb-10 flex flex-wrap items-center justify-center gap-2">
          {GRADES.map((g) => {
            const label = gradeToLabel(g);
            const isSelected = grade === label;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(label)}
                className={`min-w-[2.5rem] rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  isSelected
                    ? "border-teal-400 bg-teal-400/20 text-teal-300"
                    : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            );
          })}
        </section>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-8 text-sm text-neutral-400">
          {STATS.map((stat) => (
            <span key={stat}>{stat}</span>
          ))}
        </div>

        <button
          type="button"
          onClick={onStartSession}
          disabled={!subject || !grade}
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

type SummaryView = "loading" | "summary" | "error";

export default function Home() {
  const [inSession, setInSession] = useState(false);
  const [subject, setSubject] = useState<string | null>("fractions");
  const [grade, setGrade] = useState<string | null>(null);
  const [summaryView, setSummaryView] = useState<SummaryView | null>(null);
  const [summaryData, setSummaryData] = useState<SessionSummaryData | null>(null);
  const lastSubjectRef = useRef<string>("fractions");
  const lastGradeRef = useRef<string>("8th");

  const handleEnd = useCallback(
    async (transcript: TranscriptEntry[], durationSeconds: number) => {
      setInSession(false);
      setSummaryView("loading");
      lastSubjectRef.current = subject ?? "fractions";
      lastGradeRef.current = grade ?? DEFAULT_GRADE;

      const transcriptText = transcript
        .map((e) => `${e.role === "student" ? "Student" : "Tutor"}: ${e.text}`)
        .join("\n");

      try {
        const res = await fetch("/api/session-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: transcriptText,
            studentName: "",
            grade: lastGradeRef.current,
            subject: TOPIC_TO_SUBJECT[lastSubjectRef.current] ?? "MATH",
            topic: lastSubjectRef.current,
            durationSeconds,
          }),
        });
        if (!res.ok) throw new Error("Summary failed");
        const data = (await res.json()) as SessionSummaryData;
        setSummaryData(data);
        setSummaryView("summary");
      } catch {
        setSummaryView("error");
      }
    },
    [subject, grade]
  );

  const goToLanding = useCallback((clearTopic = false) => {
    setSummaryView(null);
    setSummaryData(null);
    if (clearTopic) setSubject(null);
  }, []);

  if (summaryView === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440] font-sans">
        <p className="text-lg text-neutral-300">Generating your session summary...</p>
        <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-teal-400/60" />
        </div>
      </div>
    );
  }

  if (summaryView === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440] font-sans">
        <p className="text-lg text-neutral-300">Session complete! Summary unavailable.</p>
        <button
          type="button"
          onClick={() => goToLanding(true)}
          className="rounded-full bg-[#00d4c8] px-6 py-3 font-medium text-[#0f1129] transition hover:bg-[#22d3ee]"
        >
          Start New Session
        </button>
      </div>
    );
  }

  if (summaryView === "summary" && summaryData) {
    return (
      <SessionSummary
        data={summaryData}
        onStudyAgain={() => goToLanding(false)}
        onNewTopic={() => goToLanding(true)}
      />
    );
  }

  if (!inSession) {
    return (
      <Landing
        subject={subject}
        setSubject={(s) => setSubject(s)}
        grade={grade}
        setGrade={(g) => setGrade(g)}
        onStartSession={() => setInSession(true)}
      />
    );
  }

  return (
    <TutorRoom
      autoConnect
      grade={grade ?? DEFAULT_GRADE}
      subject={subject ?? "fractions"}
      onEnd={handleEnd}
    />
  );
}
