# Nerdy Tutor — Requirements Checklist

Based on **Nerdy 1.pdf** (Live AI Video Tutor / Low Latency Response) and **NerdyTutor_PRD v1.0** (Gauntlet AI G4 x Nerdy). Use this to verify deliverables and evaluation criteria before submission.

> **Conflict to resolve:** E2E latency target — Nerdy 1.pdf: under 1s required, under 500ms ideal. PRD: under 3s (student stops speaking → avatar responds). Decide which target applies for evaluation.

---

## Deliverables

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | **1–5 minute demo video** of AI video tutor teaching 1–3 concepts (6th–12th grade) using Socratic method | ⬜ | Record and upload; show full tutoring interaction |
| 2 | **Low-latency AI video avatar tutor prototype** (working system) | ✅ | Next.js + LiveKit + agent (Deepgram, Groq, Cartesia, Simli) |
| 3 | **Latency benchmarking framework** with per-stage results | ✅ | Agent logs STT/LLM/TTS/E2E; frontend LatencyDashboard shows STT, LLM, TTS, E2E |
| 4 | **Educational interaction quality assessment** demonstrating Socratic method effectiveness | ⬜ | Add rubric or evaluation script; session summary API gives post-session summary |
| 5 | **Deployed & public** — application accessible via public URL for demo and evaluation | ⬜ | PRD: demo-ready without local setup |
| 6 | **Demo-ready** — can be shown live to hiring partner without local setup | ⬜ | PRD Section 3.5 |

**Deployment Target (from PRD):** Vercel (frontend) + Railway or similar (agent backend)

---

## Core Objectives

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | Build AI video avatar tutor teaching **1–3 concepts** at **6th–12th grade** | ✅ | Fractions, cell mitosis, photosynthesis; grade options 6th, 8th, 10th |
| 2 | **Socratic method** — guide via questions, not lecturing | ✅ | System prompt: "You NEVER give direct answers — every response must end with a question" |
| 3 | **Sub-second end-to-end response latency** for natural conversation | ⬜ | Measure; target <1s (required), <500ms (ideal). Current pipeline streams; STT was ~2.4s before Nova-3 tweaks |
| 4 | **1–5 minute recorded demo** showing complete tutoring interaction | ⬜ | Not yet recorded |

---

## 1. Latency Optimization

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | End-to-end latency (student finishes speaking → avatar responds): **<1s required, <500ms ideal** | ⬜ | Logged in agent + frontend dashboard; verify with real runs |
| 2 | Time to first audio byte (streamed): **<500ms required** | ⬜ | TTS first-byte in metrics; verify |
| 3 | Lip-sync alignment (avatar mouth vs audio): **within ±80ms** (target ±45ms) | ⬜ | Simli handles lip-sync; not measured in repo |
| 4 | Full response completion (typical exchange): **<3s** | ⬜ | Depends on response length; track in metrics |
| 5 | **Per-stage latency** measurement (STT, LLM, TTS, avatar) | ✅ | Agent: `on_metrics` logs STT, LLM_TTFT, TTS_TTFB, E2E; frontend shows STT/LLM/TTS/E2E |
| 6 | **Streaming** through full pipeline (LLM → TTS → avatar) | ✅ | LiveKit Agents + streaming STT/TTS + Simli |
| 7 | Per-component **latency budgets** (STT <300ms, LLM TTFT <400ms, TTS <300ms, avatar <200ms, network <100ms) | ⬜ | Document actuals vs budget; optimize where over |
| 8 | **Latency instrumentation events** — log at stage boundaries: speech_end_detected, stt_transcript_received, llm_first_token, tts_first_chunk, avatar_audio_start | ⬜ | PRD Section 4; timestamps at each boundary |
| 9 | **LLM latency metric** — reflect actual Groq inference time at stage boundary, not downstream computed value | ⬜ | PRD: fix logging accuracy |

---

## 2. Video Interaction (Required)

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | **Video-based** AI tutor interaction | ✅ | Simli avatar publishes video to room; frontend shows avatar |
| 2 | **Voice input/output** integration | ✅ | Deepgram STT, Cartesia TTS, room audio |
| 3 | **Video avatar or real-time visual feedback** | ✅ | Simli real-time avatar with lip-sync |
| 4 | Seamless modality switching | ✅ | Single voice/video flow; topic switch via speech |
| 5 | Natural conversation flow | ✅ | VAD turn detection, greeting, rephrase on inactivity |
| 6 | **Mic activation** — student can toggle microphone on/off | ⬜ | PRD Section 3.2 |
| 7 | **Session status indicators** — connection state (connecting, active, disconnected) | ⬜ | PRD Section 3.2 |
| 8 | **Responsive layout** — usable on desktop browsers | ⬜ | PRD Section 3.2 |
| 9 | **Error handling** — graceful degradation on any stage failure | ⬜ | PRD Section 3.3 |

---

## 3. Educational Quality — Socratic Method

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | **Socratic method** as primary approach (guiding questions, not answers) | ✅ | Prompt: never give direct answers; end with question |
| 2 | **6th–12th grade** appropriate scaffolding | ✅ | Grade in metadata; prompt includes grade level |
| 3 | Teach **1–3 clearly defined concepts** per session | ✅ | User picks one topic; concept tracker shows coverage |
| 4 | **Adapt** questioning (follow-up when wrong, advance when right) | ✅ | Prompt: wrong → question that reveals error; right → explain why |
| 5 | **Accurate subject matter** | ⬜ | Relies on LLM; no formal accuracy test in repo |
| 6 | Hint flow that nudges without giving answer | ✅ | "Hint" button → Socratic hint question |
| 7 | **Concise responses** — target 2–4 sentences per turn; tutors guide, don't lecture | ⬜ | PRD Section 3.4 |
| 8 | **No unsolicited information** — answer what was asked, then check in | ⬜ | PRD Section 3.4 |
| 9 | **Accuracy-first** — correct student misconceptions directly and clearly | ⬜ | PRD Section 3.4 |

---

## 4. System Architecture

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | Efficient model serving / real-time design | ✅ | Groq (fast LLM), Deepgram Nova-3, Cartesia streaming |
| 2 | Caching / pre-computation strategies | ⬜ | Not implemented (e.g. greeting is dynamic) |
| 3 | Edge deployment considerations | ⬜ | Not documented |
| 4 | Cost–performance tradeoff analysis | ⬜ | Not in repo |

---

## 5. Deployment (PRD Section 3.5)

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | **Frontend deployed to Vercel** — public URL accessible | ⬜ | |
| 2 | **Agent backend deployed** — Railway, Render, or equivalent; reachable | ⬜ | |
| 3 | **LiveKit server configured** — cloud or self-hosted | ⬜ | |
| 4 | **Environment variables documented** — all API keys and config listed | ⬜ | DEEPGRAM, GROQ, CARTESIA, SIMLI, LIVEKIT_* |
| 5 | **Demo-ready** — show live without local setup | ⬜ | PRD success criterion |

---

## Inputs & Outputs

| # | Requirement | Status | Notes |
|---|-------------|--------|--------|
| 1 | **Inputs:** text (transcript), voice (audio), context (subject, grade, history) | ✅ | STT → transcript; room metadata (grade, subject); conversation in session |
| 2 | **Outputs:** text (streamed), voice (TTS), **video (required)** | ✅ | LLM → TTS → Simli avatar → video track |
| 3 | **Metrics:** latency measurements | ✅ | Logged + frontend dashboard |

---

## Success Criteria (Summary)

| Category | Metric | Target | Status |
|----------|--------|--------|--------|
| Latency | End-to-end (input → avatar speaks) | <1s required, <500ms ideal | ⬜ Measure |
| Latency | Time to first audio byte | <500ms | ⬜ Measure |
| Latency | Lip-sync | within ±80ms | ⬜ Measure (Simli) |
| Latency | Full response completion | <3s typical | ⬜ Measure |
| Quality | Response accuracy | 90%+ | ⬜ Assess |
| Quality | Educational helpfulness | 4/5+ | ⬜ Assess |
| Pedagogy | Socratic usage | Guiding questions, no lecturing | ✅ Prompt + tests |
| Pedagogy | Grade appropriateness | 6th–12th | ✅ |
| Deliverable | Demo video | 1–5 min, 1–3 concepts | ⬜ Record |
| UX | Conversation naturalness | Prefer over chatbot | ⬜ User study |
| Technical | Availability | 99%+ | ⬜ Deploy & monitor |

---

## Evaluation Criteria (Rubric)

### 1. Latency Performance (25%)
- End-to-end <1s (good), <500ms (excellent)
- Lip-sync ±80ms (good), ±45ms (excellent)
- Full response <3s
- Pipeline streaming: ✅ in place

### 2. Video Integration (15%)
- Video avatar with lip-sync: ✅ Simli
- Engagement cues (listening/thinking): ✅ Frontend state (listening ring, thinking spinner)

### 3. Educational Quality (25%)
- Socratic method: ✅ Prompt + hint + topic switch
- 1–3 concepts, 6th–12th: ✅
- Demo video: ⬜

### 4. Technical Innovation (15%)
- Per-stage optimization: ✅ Nova-3, endpointing, VAD tuning
- Document tradeoffs and bottlenecks: ⬜

### 5. Implementation Quality (10%)
- Clean architecture: ✅ Agent + Next.js + LiveKit
- Per-stage latency framework: ✅
- One-command setup: ⬜ README is generic; add agent + env instructions
- **Tests:** 20 tests in `agent/tests/test_agent.py` (some expect old config, e.g. Nova-2)

### 6. Documentation (10%)
- Latency analysis: ⬜
- Limitations / recommendations: ⬜
- README setup/usage: ⬜ Expand for tutor

---

## Automatic Deductions (Avoid)

| Item | Deduction | Status |
|------|-----------|--------|
| No 1–5 min demo video | -15 | ⬜ Record |
| No Socratic method (lectures/answers) | -10 | ✅ Enforced in prompt |
| Cannot run with provided instructions | -10 | ⬜ README + one-command |
| No video avatar | -15 | ✅ Simli |
| No latency measurements / per-stage | -10 | ✅ Logged + UI |
| E2E >3s | -10 | ⬜ Verify |
| Lip-sync >200ms | -5 | ⬜ Simli SLA |

---

## Submission Checklist (from doc)

| # | Item | Status |
|---|------|--------|
| 1 | 1–5 min demo video, 1–3 concepts (6th–12th), Socratic | ⬜ |
| 2 | Code runs with one command (or minimal setup) | ⬜ |
| 3 | README explains setup and usage | ⬜ |
| 4 | Video avatar tutor with lip-sync functional | ✅ |
| 5 | E2E latency measured and <1s | ⬜ |
| 6 | Per-stage breakdown (STT, LLM, TTS, avatar) | ✅ |
| 7 | Lip-sync measured and within ±80ms | ⬜ |
| 8 | Socratic method demonstrated | ✅ |
| 9 | Optimization strategies documented per stage | ⬜ |
| 10 | Decision log for major choices | ⬜ |
| 11 | Limitations explicitly stated | ⬜ |

---

## Remaining Work (PRD Section 5.2)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **STT Latency Reduction** — investigate Deepgram endpointing, chunking, connection warm-up | ⬜ | |
| 2 | **Avatar Mouth Sync** — debug Simli lip sync timing; audio/video perceptibly aligned, no drift | ⬜ | PRD: high-priority risk |
| 3 | **LLM Latency Metric Logging** — fix so LLM latency = actual Groq inference at stage boundary | ⬜ | |
| 4 | **End-to-End Latency Validation** — run full pipeline timing tests; confirm each stage hits targets | ⬜ | |
| 5 | **Polish & UX** — session UI cleanup, error state handling, connection feedback | ⬜ | |
| 6 | **Demo Prep** — record demo video; confirm public URL works without local config | ⬜ | |

---

## Risks & Mitigations (PRD Section 7)

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Avatar sync drift | High | Tune Simli audio offset; test TTS chunk sizes; fallback to audio-only if needed |
| Latency budget exceeded | Medium | Profile each stage; explore Deepgram endpointing if STT bottleneck |
| LiveKit connection instability | Medium | Use LiveKit Cloud; implement reconnect logic; test on real networks |
| Simli API rate limits | Medium | Test under load; fallback to TTS-only (no avatar) for demo resilience |
| Groq token rate limits | Low | Monitor; implement simple queue if needed |
| Deployment environment gaps | Low | Test deployed version early; validate mic permissions on Vercel URL |

---

## Environment Variables (PRD Section 8)

All must be configured in local `.env` and deployment platform: `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `CARTESIA_API_KEY`, `SIMLI_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`.

---

## Recommended Next Steps

1. **Record** 1–5 minute demo video (one session, 1–3 concepts, show Socratic Q&A).
2. **Measure** end-to-end and per-stage latency in production; document vs targets.
3. **Update README**: one-command run (e.g. `./scripts/run.sh` or clear env + `npm run dev` + `python agent.py dev`), env vars, LiveKit setup.
4. **Fix or relax** agent tests that assume old config (Nova-2, VAD 0.55/0.3) so they pass.
5. **Add** short docs: latency methodology, tradeoffs, limitations, decision log.
6. **Optionally** add lip-sync measurement (if Simli provides or you can derive from timestamps).
7. **Deploy** frontend to Vercel and agent to Railway (or equivalent); ensure public URL is demo-ready.

Legend: ✅ Implemented / in place | ⬜ Not done or not verified
