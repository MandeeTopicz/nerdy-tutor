"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import {
  LiveKitRoom,
  useVoiceAssistant,
  useTextStream,
  useTranscriptions,
  TrackToggle,
  useRoomContext,
  useRemoteParticipants,
  VideoTrack,
  useParticipantTracks,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { TrackReference } from "@livekit/components-core";

const TOPIC_AGENT_EVENTS = "lk.agent.events";

export type TranscriptMessage = { role: "You" | "Tutor"; text: string };
export type TranscriptEntry = { role: "tutor" | "student"; text: string; timestamp: number };
export type SessionEndMeta = { timedOut?: boolean; everResponded?: boolean };
const SESSION_BG = "bg-[#0f1129]";
const SESSION_GRADIENT = "bg-gradient-to-b from-[#0f1129] to-[#1a1440]";

/** Static Tailwind classes for avatar glow — all variants must be full strings so production purge keeps them. */
const AVATAR_GLOW_CLASSES: Record<string, string> = {
  celebrating: "shadow-[0_0_50px_rgba(74,222,128,0.4)]",
  listening: "shadow-[0_0_40px_rgba(0,212,200,0.35)]",
  thinking: "shadow-[0_0_40px_rgba(245,158,11,0.35)]",
  speaking: "shadow-[0_0_45px_rgba(74,222,128,0.4)]",
  none: "shadow-none",
};

/** Wraps VideoTrack and forces the video element to be unmuted so avatar/agent audio is heard (Simli sends audio with the video track). */
function UnmutedVideoTrack({
  trackRef,
  className,
}: {
  trackRef: TrackReference;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [needsInteraction, setNeedsInteraction] = useState(false);

  const unmute = useCallback(() => {
    const el = containerRef.current?.querySelector("video");
    if (!el) return;
    el.muted = false;
    // Check if browser actually allowed unmuting
    if (el.muted) {
      setNeedsInteraction(true);
    } else {
      setNeedsInteraction(false);
    }
  }, []);

  const handleUserUnmute = useCallback(() => {
    const el = containerRef.current?.querySelector("video");
    if (el) {
      el.muted = false;
      el.play().catch(() => {});
      setNeedsInteraction(false);
    }
  }, []);

  useEffect(() => {
    unmute();
    const t = setTimeout(unmute, 500);
    return () => clearTimeout(t);
  }, [trackRef, unmute]);

  // Observe for the video element being added/replaced in the DOM
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new MutationObserver(() => unmute());
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [unmute]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`} style={{ width: "100%", height: "100%" }}>
      <VideoTrack
        trackRef={trackRef}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {needsInteraction && (
        <button
          type="button"
          onClick={handleUserUnmute}
          className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-black/70 px-4 py-3 text-sm font-medium text-amber-300 backdrop-blur-sm transition hover:bg-black/80"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 01-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
            <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
          </svg>
          Tap to enable avatar audio
        </button>
      )}
    </div>
  );
}

function EndSessionButton({
  onEnd,
  getTranscript,
  getDurationSeconds,
  onBeforeEnd,
}: {
  onEnd?: (transcript: TranscriptEntry[], durationSeconds: number, meta?: SessionEndMeta) => void;
  getTranscript: () => TranscriptEntry[];
  getDurationSeconds: () => number;
  onBeforeEnd?: () => void;
}) {
  const room = useRoomContext();
  const handleEndSession = useCallback(async () => {
    onBeforeEnd?.();
    const transcript = getTranscript();
    const durationSeconds = getDurationSeconds();
    await room.disconnect();
    onEnd?.(transcript, durationSeconds);
  }, [room, onEnd, getTranscript, getDurationSeconds, onBeforeEnd]);
  return (
    <button
      type="button"
      onClick={handleEndSession}
      className="rounded-xl border border-rose-500/60 px-6 py-3 text-base font-medium text-rose-400 transition hover:bg-rose-500/10"
    >
      End session
    </button>
  );
}



function SessionTimer() {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="font-mono text-sm text-neutral-400">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function MicControl() {
  return (
    <TrackToggle
      source={Track.Source.Microphone}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-[#00d4c8] text-[#0f1129] shadow-lg transition hover:bg-[#22d3ee]"
    />
  );
}

/** RoomAudioRenderer plays the audio track published by Simli's avatar participant. */
function RoomAudioRendererWithLog() {
  useEffect(() => {
    console.log("[Audio] RoomAudioRenderer mounted");
    return () => console.log("[Audio] RoomAudioRenderer unmounted");
  }, []);
  return <RoomAudioRenderer />;
}

interface LatencyMetrics {
  stt: number | null;
  llmTtft: number | null;
  tts: number | null;
  e2e: number | null;
  turn: number;
}

const CONCEPT_LISTS: Record<string, string[]> = {
  fractions: ["Numerator & Denominator", "Equivalent Fractions", "Adding Fractions", "Multiplying Fractions"],
  "cell-mitosis": ["Cell Cycle", "Prophase", "Metaphase", "Anaphase & Telophase"],
  mitosis: ["Cell Cycle", "Prophase", "Metaphase", "Anaphase & Telophase"],
  photosynthesis: ["Light Reactions", "Calvin Cycle", "Chlorophyll", "Glucose Production"],
};

function ConceptTracker({ subject, coveredConcepts }: { subject: string; coveredConcepts: string[] }) {
  const concepts = CONCEPT_LISTS[subject] ?? CONCEPT_LISTS.fractions;
  return (
    <div className="mt-2 flex w-full flex-wrap gap-1.5">
      {concepts.map((c) => {
        const covered = coveredConcepts.includes(c);
        return (
          <span
            key={c}
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              covered ? "bg-teal-400/10 text-teal-300 line-through" : "bg-white/5 text-neutral-500"
            }`}
          >
            {c}
          </span>
        );
      })}
    </div>
  );
}

function LatencyDashboard({ metrics }: { metrics: LatencyMetrics }) {
  return (
    <div className="mt-2 flex w-full flex-row justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-400">
      <span>STT <span className="font-mono text-white">{metrics.stt != null ? `${(metrics.stt * 1000).toFixed(0)}ms` : "—"}</span></span>
      <span>LLM <span className="font-mono text-white">{metrics.llmTtft != null ? `${(metrics.llmTtft * 1000).toFixed(0)}ms` : "—"}</span></span>
      <span>TTS <span className="font-mono text-white">{metrics.tts != null ? `${(metrics.tts * 1000).toFixed(0)}ms` : "—"}</span></span>
      <span>E2E <span className="font-mono text-white">{metrics.e2e != null ? `${(metrics.e2e * 1000).toFixed(0)}ms` : "—"}</span></span>
    </div>
  );
}

/** Merge consecutive same-role segments into one message so the transcript reads as whole turns. */
function mergeConsecutiveSameRole(messages: TranscriptMessage[]): TranscriptMessage[] {
  if (messages.length <= 1) return messages;
  const out: TranscriptMessage[] = [];
  let cur = { ...messages[0] };
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === cur.role) {
      cur = { ...cur, text: `${cur.text} ${messages[i].text}`.trim() };
    } else {
      out.push(cur);
      cur = { ...messages[i] };
    }
  }
  out.push(cur);
  return out;
}

function useTranscriptMessages(): TranscriptMessage[] {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  return useMemo(() => {
    const raw = transcriptions.map((t) => ({
      role: (t.participantInfo.identity === localParticipant.identity ? "You" : "Tutor") as "You" | "Tutor",
      text: t.text,
    }));
    return mergeConsecutiveSameRole(raw);
  }, [transcriptions, localParticipant.identity]);
}

/**
 * Wraps useTranscriptMessages so new Tutor lines are revealed progressively
 * over the duration of speech. Estimates total speech time from word count
 * (~160 WPM) and distributes words evenly across that window in chunks.
 * User lines pass through immediately. When the agent stops speaking, any
 * remaining text is shown in full.
 */
function useSyncedTranscriptMessages(agentState: string): TranscriptMessage[] {
  const raw = useTranscriptMessages();
  const releasedIdxRef = useRef(0);
  const [revealFraction, setRevealFraction] = useState(1); // 0→1 over speech duration
  const rafRef = useRef<number | null>(null);
  const speechStartRef = useRef(0);
  const speechDurationRef = useRef(0);
  const revealingMsgIdxRef = useRef(-1);
  const prevAgentState = useRef(agentState);

  // Release tutor messages once agent is speaking or listening (finished speaking)
  if (agentState === "speaking" || agentState === "listening") {
    releasedIdxRef.current = raw.length;
  } else {
    while (
      releasedIdxRef.current < raw.length &&
      raw[releasedIdxRef.current].role === "You"
    ) {
      releasedIdxRef.current++;
    }
  }

  const released = raw.slice(0, releasedIdxRef.current);

  let lastTutorIdx = -1;
  for (let i = released.length - 1; i >= 0; i--) {
    if (released[i].role === "Tutor") { lastTutorIdx = i; break; }
  }

  useEffect(() => {
    // Agent just started speaking — begin progressive reveal
    if (agentState === "speaking" && lastTutorIdx >= 0 && lastTutorIdx !== revealingMsgIdxRef.current) {
      revealingMsgIdxRef.current = lastTutorIdx;
      const wordCount = (released[lastTutorIdx]?.text ?? "").split(/\s+/).length;
      // Estimate speech duration: ~160 WPM = 375ms/word, with a small buffer
      speechDurationRef.current = Math.max(1000, wordCount * 375);
      speechStartRef.current = performance.now();
      setRevealFraction(0);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const tick = () => {
        const elapsed = performance.now() - speechStartRef.current;
        const frac = Math.min(1, elapsed / speechDurationRef.current);
        setRevealFraction(frac);
        if (frac < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    // Agent stopped speaking — show everything
    if (agentState !== "speaking" && prevAgentState.current === "speaking") {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setRevealFraction(1);
      revealingMsgIdxRef.current = -1;
    }

    prevAgentState.current = agentState;
  }, [agentState, lastTutorIdx, released]);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return released.map((msg, i) => {
    if (i === revealingMsgIdxRef.current && msg.role === "Tutor" && revealFraction < 1) {
      const words = msg.text.split(/\s+/);
      const show = Math.max(1, Math.ceil(words.length * revealFraction));
      if (show >= words.length) return msg;
      return { ...msg, text: words.slice(0, show).join(" ") };
    }
    return msg;
  });
}

/** Static class strings for transcript panel visibility — no interpolation so Tailwind keeps them. */
const TRANSCRIPT_PANEL_OPEN =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 text-xs transition-all duration-300 opacity-100";
const TRANSCRIPT_PANEL_CLOSED = "hidden";

function LiveTranscriptPanel({
  messages,
  isOpen,
  onToggle,
}: {
  messages: TranscriptMessage[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 flex w-fit shrink-0 items-center gap-1.5 self-end rounded-full border border-teal-400/40 px-3 py-1.5 text-xs font-medium text-teal-300 transition hover:bg-teal-400/10"
      >
        {isOpen ? "💡 Transcript " : ""}
        <span className={isOpen ? "inline-block rotate-180 transition-transform duration-300" : "inline-block transition-transform duration-300"}>
          ‹
        </span>
        {isOpen ? "" : " Transcript"}
      </button>
      <div className={isOpen ? TRANSCRIPT_PANEL_OPEN : TRANSCRIPT_PANEL_CLOSED}>
        <div className="shrink-0 text-xs font-medium text-teal-400">💡 Live Transcript</div>
        <div ref={scrollRef} className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i}>
              <span className={m.role === "You" ? "text-teal-300" : "text-white"}>{m.role}: </span>
              <span className="text-neutral-300">{m.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TutorRoomInner({
  onEnd,
  getTranscript,
  getDurationSeconds,
  subject = "fractions",
}: {
  onEnd?: (transcript: TranscriptEntry[], durationSeconds: number, meta?: SessionEndMeta) => void;
  getTranscript: () => TranscriptEntry[];
  getDurationSeconds: () => number;
  subject?: string;
}) {
  const room = useRoomContext();
  const { videoTrack: agentVideoTrack, state: agentState } = useVoiceAssistant();
  const stateStr = typeof agentState === "string" ? agentState : (agentState as { state?: string })?.state ?? "connecting";
  const { textStreams } = useTextStream(TOPIC_AGENT_EVENTS);
  const rawTranscriptMessages = useTranscriptMessages();
  const transcriptMessages = useSyncedTranscriptMessages(stateStr);
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();
  const { microphoneTrack } = useLocalParticipant();
  const firstRemote = remoteParticipants[0]?.identity;
  const secondRemote = remoteParticipants[1]?.identity;
  const firstTracks = useParticipantTracks([Track.Source.Camera], firstRemote ?? "");
  const secondTracks = useParticipantTracks([Track.Source.Camera], secondRemote ?? "");
  const fallbackVideoTrack: TrackReference | undefined =
    firstTracks[0] ?? secondTracks[0];
  const videoTrack = agentVideoTrack ?? fallbackVideoTrack;
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [coveredConcepts, setCoveredConcepts] = useState<string[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const prevAgentStateRef = useRef<string | undefined>(undefined);

  const endReasonRef = useRef<"timeout" | "button" | "unexpected" | null>(null);
  const wasConnectedRef = useRef(false);

  // Enable mic when agent signals it's ready (after intro finishes)
  useEffect(() => {
    if (!micReady) return;
    room.localParticipant
      .setMicrophoneEnabled(true)
      .then(() => console.log("[Mic] enabled after intro"))
      .catch((e: unknown) => console.error("[Mic] failed to enable:", e));
  }, [micReady, room]);

  useDataChannel((msg) => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload));
      console.log("[Data] received:", payload);
      if (payload.type === "mic_ready") {
        setMicReady(true);
      }
      if (payload.type === "concept_covered" && payload.concept) {
        setCoveredConcepts((prev) => (prev.includes(payload.concept) ? prev : [...prev, payload.concept]));
      }
      if (payload.type === "session_timeout") {
        endReasonRef.current = "timeout";
        const everResponded = payload.student_ever_responded ?? false;
        const transcript = getTranscript();
        const durationSeconds = getDurationSeconds();
        // Agent already waited for closing message to finish speaking before
        // sending this signal — small grace period for final audio to flush
        setTimeout(async () => {
          await room.disconnect();
          onEnd?.(transcript, durationSeconds, { timedOut: true, everResponded });
        }, 2000);
      }
    } catch { /* ignore */ }
  });

  useEffect(() => {
    if (connectionState === "connected") wasConnectedRef.current = true;
  }, [connectionState]);

  useEffect(() => {
    if (connectionState !== "disconnected") return;
    if (endReasonRef.current !== null) return;
    if (!wasConnectedRef.current) return;
    endReasonRef.current = "unexpected";
    const transcript = getTranscript();
    const durationSeconds = getDurationSeconds();
    onEnd?.(transcript, durationSeconds, { timedOut: true, everResponded: false });
  }, [connectionState, getTranscript, getDurationSeconds, onEnd]);

  useEffect(() => {
    const state = typeof agentState === "string" ? agentState : (agentState as { state?: string })?.state;
    if (state === "speaking" && prevAgentStateRef.current !== "speaking") {
      const lastTutor = [...rawTranscriptMessages].reverse().find((m) => m.role === "Tutor");
      const text = (lastTutor?.text ?? "").toLowerCase();
      const positive = ["exactly", "correct", "great", "right", "yes"].some((w) => text.includes(w));
      if (positive) {
        setCelebrating(true);
        const t = setTimeout(() => setCelebrating(false), 2000);
        return () => clearTimeout(t);
      }
    }
    prevAgentStateRef.current = state;
  }, [agentState, rawTranscriptMessages]);

  useEffect(() => {
    console.log("[LiveKit] connectionState:", connectionState);
  }, [connectionState]);
  useEffect(() => {
    console.log("[Participants]", remoteParticipants.map((p) => p.identity));
  }, [remoteParticipants]);
  useEffect(() => {
    console.log("[Avatar] videoTrack:", videoTrack ? "present" : "null");
  }, [videoTrack]);
  useEffect(() => {
    if (microphoneTrack) console.log("[Mic] track published");
  }, [microphoneTrack]);

  const [metrics, setMetrics] = useState<LatencyMetrics>({
    stt: null,
    llmTtft: null,
    tts: null,
    e2e: null,
    turn: 0,
  });

  useEffect(() => {
    if (textStreams.length === 0) return;
    for (const stream of textStreams) {
      try {
        const ev = JSON.parse(stream.text);
        if (ev?.type !== "metrics_collected" || !ev.metrics) continue;
        const m = ev.metrics as { type?: string; transcription_delay?: number; duration?: number; llm_node_ttft?: number; ttft?: number; tts_node_ttfb?: number; ttfb?: number; e2e_latency?: number };
        const isEou = m.type === "eou_metrics";
        const sttVal = isEou && m.transcription_delay != null ? m.transcription_delay : undefined;
        const llmVal = m.llm_node_ttft ?? m.ttft;
        const ttsVal = m.tts_node_ttfb ?? m.ttfb;
        setMetrics((prev) => {
          const nextStt = sttVal ?? prev.stt;
          const nextLlm = llmVal ?? prev.llmTtft;
          const nextTts = ttsVal ?? prev.tts;
          const e2eVal =
            nextStt != null && nextLlm != null && nextTts != null
              ? nextStt + nextLlm + nextTts
              : prev.e2e;
          return { stt: nextStt, llmTtft: nextLlm, tts: nextTts, e2e: e2eVal, turn: prev.turn + 1 };
        });
      } catch { /* ignore */ }
    }
  }, [textStreams]);

  if (connectionState === "disconnected") {
    return (
      <div className="flex h-[calc(100vh-60px)] w-full flex-row items-center justify-center px-12 font-sans">
        <p className="text-neutral-400">Session ended.</p>
      </div>
    );
  }

  return (
    <div className="relative font-sans" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: "1.5rem" }}>
      {/* Avatar: centered on screen */}
      <div style={{ width: "60vw", minWidth: "400px", maxWidth: "860px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div className="relative" style={{ width: "100%" }}>
          {/* Glow behind tile */}
          <div
            className={
              "pointer-events-none absolute -z-10 rounded-2xl transition-all duration-300 " +
              (celebrating
                ? AVATAR_GLOW_CLASSES.celebrating
                : stateStr === "listening"
                  ? AVATAR_GLOW_CLASSES.listening
                  : stateStr === "thinking"
                    ? AVATAR_GLOW_CLASSES.thinking
                    : stateStr === "speaking"
                      ? AVATAR_GLOW_CLASSES.speaking
                      : AVATAR_GLOW_CLASSES.none)
            }
            style={{ inset: "-4px" }}
          />
          {/* Avatar video */}
          <div
            className="relative border border-white/10 bg-white/5 backdrop-blur-sm"
            style={{ width: "100%", aspectRatio: "16/9", maxHeight: "60vh", overflow: "hidden", borderRadius: "1rem" }}
          >
            {videoTrack ? (
              <UnmutedVideoTrack trackRef={videoTrack} className="" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 bg-white/5" style={{ width: "100%", height: "100%" }}>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" />
                <p className="text-sm text-neutral-400">Loading avatar…</p>
              </div>
            )}
          </div>
        </div>
        {/* Controls */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "1rem", paddingTop: "0.75rem" }}>
          <MicControl />
          <EndSessionButton
            onEnd={onEnd}
            getTranscript={getTranscript}
            getDurationSeconds={getDurationSeconds}
            onBeforeEnd={() => { endReasonRef.current = "button"; }}
          />
        </div>
        <LatencyDashboard metrics={metrics} />
        <ConceptTracker subject={subject} coveredConcepts={coveredConcepts} />
      </div>

      {/* Transcript: pinned to right edge */}
      <div style={{ position: "absolute", right: "1rem", top: "1.5rem", bottom: "1.5rem", width: "220px", display: "flex", flexDirection: "column" }}>
        <LiveTranscriptPanel
          messages={transcriptMessages}
          isOpen={transcriptOpen}
          onToggle={() => setTranscriptOpen((o) => !o)}
        />
      </div>
    </div>
  );
}

const DISCONNECT_CLEANUP_MS = 400;

function formatSubject(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function RoomContent({
  onEnd,
  grade = "8th",
  subject = "fractions",
}: {
  onEnd?: (transcript: TranscriptEntry[], durationSeconds: number, meta?: SessionEndMeta) => void;
  grade?: string;
  subject?: string;
}) {
  const transcriptMessages = useTranscriptMessages();
  const sessionStartRef = useRef<number | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  if (sessionStartRef.current == null) sessionStartRef.current = Date.now();

  useEffect(() => {
    const entries: TranscriptEntry[] = transcriptMessages.map((m, i) => {
      const role = m.role === "You" ? "student" : "tutor";
      const existing = transcriptRef.current[i];
      const timestamp = existing?.text === m.text ? (existing?.timestamp ?? Date.now()) : Date.now();
      return { role, text: m.text, timestamp };
    });
    transcriptRef.current = entries;
  }, [transcriptMessages]);

  const getTranscript = useCallback(() => [...transcriptRef.current], []);
  const getDurationSeconds = useCallback(
    () => Math.floor((Date.now() - (sessionStartRef.current ?? Date.now())) / 1000),
    []
  );

  return (
    <>
      <RoomAudioRendererWithLog />
      <div className="flex h-screen flex-col overflow-hidden bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440]">
        <header className="relative flex shrink-0 h-20 items-center justify-between border-b border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm">
          <h1 className="text-2xl font-medium lowercase tracking-tight text-white">nerdy</h1>
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-4 text-sm text-neutral-400">
            <span>{formatSubject(subject)} · {grade} Grade</span>
            <span className="text-neutral-500">|</span>
            <SessionTimer />
          </div>
          <div />
        </header>
        <main className="flex min-h-0 flex-1 overflow-hidden">
          <TutorRoomInner onEnd={onEnd} getTranscript={getTranscript} getDurationSeconds={getDurationSeconds} subject={subject} />
        </main>
      </div>
    </>
  );
}

export default function TutorRoom({
  autoConnect = false,
  grade = "8th",
  subject = "fractions",
  onEnd,
}: {
  autoConnect?: boolean;
  grade?: string;
  subject?: string;
  onEnd?: (transcript: TranscriptEntry[], durationSeconds: number, meta?: SessionEndMeta) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantIdRef = useRef<string | null>(null);
  const connectCalledRef = useRef(false);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("Failed to get config");
    const { livekitUrl: url } = (await res.json()) as { livekitUrl: string };
    setLivekitUrl(url);
    return url;
  }, []);

  const fetchToken = useCallback(async () => {
    setError(null);
    try {
      if (!participantIdRef.current) participantIdRef.current = `student-${Date.now()}`;
      const params = new URLSearchParams({
        participant: participantIdRef.current,
        grade,
        subject,
      });
      const res = await fetch(`/api/livekit-token?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to get token");
      const { token: t } = (await res.json()) as { token: string };
      setToken(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    }
  }, [grade, subject]);

  const clearConnectionState = useCallback(() => {
    setConnected(false);
    setToken(null);
    participantIdRef.current = null;
  }, []);

  const handleConnect = useCallback(async () => {
    setConnected(true);
    setError(null);
    try {
      await fetchConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get config");
      return;
    }
    fetchToken();
  }, [fetchConfig, fetchToken]);

  const handleDisconnect = useCallback(() => {
    if (disconnectTimeoutRef.current) clearTimeout(disconnectTimeoutRef.current);
    disconnectTimeoutRef.current = null;
    disconnectTimeoutRef.current = setTimeout(() => {
      disconnectTimeoutRef.current = null;
      clearConnectionState();
    }, DISCONNECT_CLEANUP_MS);
  }, [clearConnectionState]);

  useEffect(() => () => { if (disconnectTimeoutRef.current) clearTimeout(disconnectTimeoutRef.current); }, []);
  useEffect(() => {
    if (autoConnect && !connected && !connectCalledRef.current) {
      connectCalledRef.current = true;
      handleConnect();
    }
  }, [autoConnect, connected, handleConnect]);

  if (!connected && !autoConnect) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440] p-8 font-sans">
        <h1 className="text-2xl font-semibold text-white">AI Video Tutor</h1>
        <p className="text-neutral-300">Connect your microphone to start the session</p>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-full bg-[#00d4c8] px-6 py-3 font-medium text-[#0f1129] transition hover:bg-[#22d3ee]"
        >
          Start session
        </button>
      </div>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1129] bg-gradient-to-b from-[#0f1129] to-[#1a1440] font-sans">
        <div className="text-neutral-300">{!livekitUrl ? "Loading…" : "Connecting…"}</div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      audio={false}
      video={false}
      onDisconnected={handleDisconnect}
      style={{ height: "100vh" }}
    >
      <RoomContent onEnd={onEnd} grade={grade} subject={subject} />
    </LiveKitRoom>
  );
}
