# Decision Log

## STT: Deepgram Nova-3
**Alternatives:** OpenAI Whisper, AssemblyAI
**Decision:** Deepgram Nova-3
**Reasoning:** Only option with true streaming + `no_delay` mode. Whisper is batch-only. AssemblyAI streaming latency was higher in testing. Nova-3 hits ~529ms transcription delay at `endpointing_ms=200`.

## LLM: Groq Llama-3.3-70b
**Alternatives:** OpenAI GPT-4o, Anthropic Claude
**Decision:** Groq Llama-3.3-70b-versatile
**Reasoning:** ~280ms TTFT due to Groq's hardware-accelerated inference — roughly 3-4x faster than OpenAI at equivalent quality. Claude is used for session summaries only, where quality matters more than speed.

## TTS: Cartesia Sonic-3
**Alternatives:** ElevenLabs, OpenAI TTS
**Decision:** Cartesia Sonic-3
**Reasoning:** ~200ms TTFB with WebSocket streaming. ElevenLabs has higher latency and per-character cost. OpenAI TTS does not support streaming to the same latency floor.

## Avatar: Simli
**Alternatives:** HeyGen, D-ID
**Decision:** Simli
**Reasoning:** First-party LiveKit plugin made integration straightforward. HeyGen and D-ID require custom WebRTC plumbing. Tradeoff: Simli adds ~600ms avatar rendering overhead to E2E latency.

## Orchestration: LiveKit Agents
**Alternatives:** Raw WebRTC, Daily.co
**Decision:** LiveKit Agents 1.4.4
**Reasoning:** Built-in STT/LLM/TTS pipeline with VAD, metrics collection, and data messaging. Eliminates ~500 lines of custom plumbing. Active community and Simli plugin support.

## State Management: Refs over Redux
**Alternatives:** Redux, Zustand, React Context
**Decision:** useRef + useCallback
**Reasoning:** Real-time audio state (agent status, connection state, latency metrics) updates at high frequency. useState triggers re-renders on every update; refs carry state without render cost for values that drive logic but not UI.
