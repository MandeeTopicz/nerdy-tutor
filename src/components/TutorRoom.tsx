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
export type SessionEndMeta = { timedOut?: boolean; everResponded?: boolean };
const SESSION_BG = "bg-[#0f1129]";
const SESSION_GRADIENT = "bg-gradient-to-b from-[#0f1129] to-[#1a1440]";
const CARD_STYLE = "rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm";

/** Wraps VideoTrack and forces the video element to be unmuted so avatar/agent audio is heard (Simli sends audio with the video track). */
function UnmutedVideoTrack({
  trackRef,
  className,
}: {
  trackRef: TrackReference;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unmute = useCallback(() => {
    const el = containerRef.current?.querySelector("video");
    if (el) el.muted = false;
  }, []);
  useEffect(() => {
    unmute();
    const t = setTimeout(unmute, 200);
    return () => clearTimeout(t);
  }, [trackRef, unmute]);
  return (
    <div ref={containerRef} className={className}>
      <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" />
    </div>
  );
}

function EndSessionButton({
  onEnd,
  getTranscript,
  onBeforeEnd,
}: {
  onEnd?: (messages: TranscriptMessage[], meta?: SessionEndMeta) => void;
  getTranscript: () => TranscriptMessage[];
  onBeforeEnd?: () => void;
}) {
  const room = useRoomContext();
  const handleEndSession = useCallback(async () => {
    onBeforeEnd?.();
    const messages = getTranscript();
    await room.disconnect();
    onEnd?.(messages);
  }, [room, onEnd, getTranscript, onBeforeEnd]);
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

function HintButton() {
  const room = useRoomContext();
  const handleClick = useCallback(() => {
    const payload = JSON.stringify({ type: "hint_request" });
    room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
  }, [room]);
  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-sm text-yellow-300 transition hover:bg-yellow-400/20"
    >
      💡 Hint
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

function useTranscriptMessages(): TranscriptMessage[] {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  return useMemo(() => {
    return transcriptions.map((t) => ({
      role: (t.participantInfo.identity === localParticipant.identity ? "You" : "Tutor") as "You" | "Tutor",
      text: t.text,
    }));
  }, [transcriptions, localParticipant.identity]);
}

/**
 * Wraps useTranscriptMessages so new Tutor lines are held back until the agent
 * is actually speaking (audio/avatar playing). User lines pass through immediately.
 * This keeps the transcript in sync with what the student hears.
 */
function useSyncedTranscriptMessages(agentState: string): TranscriptMessage[] {
  const raw = useTranscriptMessages();
  const [visible, setVisible] = useState<TranscriptMessage[]>([]);
  const releasedCountRef = useRef(0);

  useEffect(() => {
    // When agent is speaking (or has finished), release all tutor messages received so far
    if (agentState === "speaking" || agentState === "listening") {
      if (raw.length > releasedCountRef.current) {
        releasedCountRef.current = raw.length;
        setVisible([...raw]);
      }
    } else {
      // While thinking/processing, only show user messages and previously released messages
      const newUserOnly = raw.filter((m, i) => i >= releasedCountRef.current && m.role === "You");
      if (newUserOnly.length > 0) {
        // Release user messages immediately
        releasedCountRef.current = raw.length;
        setVisible([...raw]);
      }
    }
  }, [raw, agentState]);

  return visible;
}

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
    <div className="flex h-[70vh] w-[28vw] min-w-[280px] max-w-[480px] flex-shrink-0 flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 flex w-fit shrink-0 items-center gap-1.5 self-end rounded-full border border-teal-400/40 px-3 py-1.5 text-xs font-medium text-teal-300 transition hover:bg-teal-400/10"
      >
        {isOpen ? "💡 Transcript " : ""}
        <span className={`inline-block transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>‹</span>
        {isOpen ? "" : " Transcript"}
      </button>
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 transition-all duration-300 ${
          isOpen ? "opacity-100" : "hidden"
        }`}
      >
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
  subject = "fractions",
}: {
  onEnd?: (messages: TranscriptMessage[], meta?: SessionEndMeta) => void;
  getTranscript: () => TranscriptMessage[];
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
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [coveredConcepts, setCoveredConcepts] = useState<string[]>([]);
  const [celebrating, setCelebrating] = useState(false);
  const prevAgentStateRef = useRef<string | undefined>(undefined);

  const endReasonRef = useRef<"timeout" | "button" | "unexpected" | null>(null);
  const wasConnectedRef = useRef(false);

  useDataChannel((msg) => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload));
      console.log("[Data] received:", payload);
      if (payload.type === "concept_covered" && payload.concept) {
        setCoveredConcepts((prev) => (prev.includes(payload.concept) ? prev : [...prev, payload.concept]));
      }
      if (payload.type === "session_timeout") {
        endReasonRef.current = "timeout";
        const everResponded = payload.student_ever_responded ?? false;
        // Agent already waited for closing message to finish speaking before
        // sending this signal — small grace period for final audio to flush
        setTimeout(async () => {
          await room.disconnect();
          onEnd?.(getTranscript(), { timedOut: true, everResponded });
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
    onEnd?.(getTranscript(), { timedOut: true, everResponded: false });
  }, [connectionState, getTranscript, onEnd]);

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
    <div className="flex h-[calc(100vh-60px)] w-full flex-row items-center justify-center gap-8 px-12 font-sans">
      {/* Left column: avatar + controls + latency */}
      <div className="flex w-[35vw] min-w-[320px] max-w-[560px] flex-shrink-0 flex-col items-center gap-4">
        <div className="relative w-full">
          {/* Glow behind tile only — video stays full opacity */}
          <div
            className={`pointer-events-none absolute -inset-1 -z-10 rounded-2xl transition-all duration-300 ${
              celebrating
                ? "shadow-[0_0_50px_rgba(74,222,128,0.4)]"
                : stateStr === "listening"
                  ? "shadow-[0_0_40px_rgba(0,212,200,0.35)]"
                  : stateStr === "thinking"
                    ? "shadow-[0_0_40px_rgba(245,158,11,0.35)]"
                    : stateStr === "speaking"
                      ? "shadow-[0_0_45px_rgba(74,222,128,0.4)]"
                      : "shadow-none"
            }`}
          />
          <div className={`relative w-full aspect-[3/4] overflow-hidden rounded-2xl ${CARD_STYLE}`}>
            {videoTrack ? (
              <UnmutedVideoTrack trackRef={videoTrack} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-neutral-400 text-sm">
                {""}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex w-full flex-row flex-wrap items-center justify-center gap-4">
          <MicControl />
          <EndSessionButton
            onEnd={onEnd}
            getTranscript={getTranscript}
            onBeforeEnd={() => { endReasonRef.current = "button"; }}
          />
          <HintButton />
        </div>
        <LatencyDashboard metrics={metrics} />
        <ConceptTracker subject={subject} coveredConcepts={coveredConcepts} />
      </div>

      {/* Right column: transcript panel */}
      <LiveTranscriptPanel
        messages={transcriptMessages}
        isOpen={transcriptOpen}
        onToggle={() => setTranscriptOpen((o) => !o)}
      />
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
  onEnd?: (messages: TranscriptMessage[], meta?: SessionEndMeta) => void;
  grade?: string;
  subject?: string;
}) {
  const transcriptMessages = useTranscriptMessages();
  const messagesRef = useRef<TranscriptMessage[]>([]);
  messagesRef.current = transcriptMessages;
  const getTranscript = useCallback(() => [...messagesRef.current], []);
  return (
    <>
      <RoomAudioRendererWithLog />
      <div className={`flex h-screen flex-col overflow-hidden ${SESSION_BG} ${SESSION_GRADIENT}`}>
        <header className="relative flex shrink-0 h-20 items-center justify-between border-b border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm">
          <h1 className="text-2xl font-medium lowercase tracking-tight text-white">nerdy</h1>
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-4 text-sm text-neutral-400">
            <span>{formatSubject(subject)} · {grade} Grade</span>
            <span className="text-neutral-500">|</span>
            <SessionTimer />
          </div>
          <nav className="flex items-center gap-4">
            <a href="#" className="text-base font-medium text-teal-400 hover:text-teal-300">NerdyTutor</a>
          </nav>
        </header>
        <main className="flex min-h-0 flex-1 overflow-hidden">
          <TutorRoomInner onEnd={onEnd} getTranscript={getTranscript} subject={subject} />
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
  onEnd?: (messages: TranscriptMessage[], meta?: SessionEndMeta) => void;
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
      <div className={`flex min-h-screen flex-col items-center justify-center gap-6 p-8 font-sans ${SESSION_BG} ${SESSION_GRADIENT}`}>
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
      <div className={`flex min-h-screen items-center justify-center font-sans ${SESSION_BG} ${SESSION_GRADIENT}`}>
        <div className="text-neutral-300">{!livekitUrl ? "Loading…" : "Connecting…"}</div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={handleDisconnect}
      style={{ height: "100vh" }}
    >
      <RoomContent onEnd={onEnd} grade={grade} subject={subject} />
    </LiveKitRoom>
  );
}
