"""
LiveKit voice agent for real-time AI video tutor.
Uses Deepgram Nova-3 (STT), Groq Llama-3.3-70b (LLM), Cartesia Sonic 3 (TTS).
Streams and overlaps all pipeline stages; logs per-stage latency.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env.local at startup (repo root, parent of agent/) before any os.getenv() calls
_env_path = Path(__file__).resolve().parent.parent / ".env.local"
load_dotenv(dotenv_path=_env_path, override=True)

import asyncio
import logging
import time
from livekit.agents import (
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import deepgram, openai, cartesia, silero, simli

logger = logging.getLogger("tutor-agent")
logger.setLevel(logging.DEBUG)

def _build_socratic_prompt(subject: str, grade: str) -> str:
    return f"""You are NerdyTutor, an AI tutor teaching {subject} at a {grade} grade level using the Socratic method.
You NEVER give direct answers — every response must end with a question.
When a student is wrong, ask a question that reveals the error without saying "wrong".
When a student is right, ask them to explain why.
When a student is stuck, ask a simpler bridging question.
Keep responses to 2-3 sentences maximum plus one question."""

def _build_greeting(subject: str) -> str:
    return f"Hi! I'm your tutor today. We're learning about {subject}. What would you like to explore first?"


async def entrypoint(ctx: JobContext):
    """Connect to room and run the voice agent."""
    await ctx.connect()

    last_student_response_time = [time.time()]
    student_ever_responded = [False]

    metadata = json.loads(ctx.room.metadata or "{}")
    grade = metadata.get("grade", "8th")
    subject = metadata.get("subject", "fractions")
    logger.info("Room metadata: grade=%s subject=%s", grade, subject)

    system_prompt = _build_socratic_prompt(subject, grade)
    greeting = _build_greeting(subject)

    # Deepgram STT — Nova-3 for lower latency; endpointing_ms=200 avoids re-buffering
    stt = deepgram.STT(
        model="nova-3",
        language="en",
        interim_results=True,
        endpointing_ms=200,  # was 50 — too-short endpointing causes re-buffering
        punctuate=False,
        smart_format=False,  # disable — adds latency
        no_delay=True,       # request lowest latency mode
    )

    # LLM: Groq Llama-3.3-70b (OpenAI-compatible API)
    # Base URL and model per Groq docs: https://console.groq.com/docs/openai
    groq_base_url = "https://api.groq.com/openai/v1"
    groq_model = "llama-3.3-70b-versatile"
    llm = openai.LLM(
        model=groq_model,
        api_key=os.environ.get("GROQ_API_KEY"),
        base_url=groq_base_url,
    )
    logger.info("LLM configured: base_url=%s model=%s", groq_base_url, groq_model)

    # TTS: Cartesia Sonic 3 streaming — plugin handles encoding/format internally
    tts = cartesia.TTS(
        model="sonic-3",
        voice="79a125e8-cd45-4c13-8a67-188112f4dd22",  # friendly voice
    )

    # Silero VAD — less sensitive to reduce background/ambient noise pickup
    vad = ctx.proc.userdata["vad"]

    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection="vad",
        allow_interruptions=False,  # Students wait for tutor to finish
        aec_warmup_duration=None,
        min_endpointing_delay=0.0,
        max_endpointing_delay=0.8,  # was 3.0 — 3s was way too long
        preemptive_generation=True,
        user_away_timeout=120.0,  # 2 minutes before marking user away
    )

    # Log metrics when collected — metrics come as EOUMetrics, STTMetrics, LLMMetrics, TTSMetrics
    # EOUMetrics: transcription_delay | LLMMetrics: ttft | TTSMetrics: ttfb | STTMetrics: duration
    def on_metrics(ev):
        try:
            ts = time.time()
            m = ev.metrics
            if m is None:
                return
            if hasattr(m, "type") and m.type == "eou_metrics":
                eou = m
                logger.info(
                    f"[EOU] end_of_utterance_delay={eou.end_of_utterance_delay*1000:.0f}ms | "
                    f"transcription_delay={eou.transcription_delay*1000:.0f}ms"
                )
                return
            d = getattr(m, "model_dump", None) or getattr(m, "dict", lambda: {})()
            if not isinstance(d, dict):
                return
            if hasattr(m, "type") and m.type == "stt_metrics":
                audio_dur = getattr(m, "audio_duration", None)
                if audio_dur is not None:
                    logger.info("[STT] audio_duration=%s (user speech length)", f"{audio_dur * 1000:.0f}ms")
            # Extract from various metric types
            stt_val = d.get("transcription_delay") or d.get("duration")  # EOUMetrics or STTMetrics
            llm_ttft = d.get("llm_node_ttft") or d.get("ttft")  # assistant or LLMMetrics
            tts_ttfb = d.get("tts_node_ttfb") or d.get("ttfb")  # assistant or TTSMetrics
            e2e = d.get("e2e_latency")
            parts = [f"t={ts:.3f}"]
            if stt_val is not None:
                parts.append(f"STT={stt_val*1000:.0f}ms")
            if llm_ttft is not None:
                parts.append(f"LLM_TTFT={llm_ttft*1000:.0f}ms")
            if tts_ttfb is not None:
                parts.append(f"TTS_TTFB={tts_ttfb*1000:.0f}ms")
            if e2e is not None:
                parts.append(f"E2E={e2e*1000:.0f}ms")
            if len(parts) > 1:
                logger.info("[LATENCY] " + " | ".join(parts))
        except Exception as e:
            logger.debug("metrics parse: %s", e)

    session.on("metrics_collected", on_metrics)

    greeting_sent = [False]  # ref so closure can mutate
    greeting_done = [False]  # True when agent has finished speaking the greeting
    rephrased_done = [False]  # rephrase sent this wait; reset when student speaks

    def on_agent_state_changed(ev):
        old_state = getattr(ev, "old_state", None)
        new_state = ev.new_state
        logger.info(
            "agent_state_changed: %s -> %s",
            old_state,
            new_state,
        )
        if new_state == "thinking":
            logger.info("[LLM] generating response...")
        elif new_state == "speaking":
            logger.info("[TTS] speaking started")
        elif old_state == "speaking" and new_state == "listening":
            logger.info("[Playback] finished, now listening")
            # Reset inactivity clock — 15s/60s count only after agent has asked and is waiting
            last_student_response_time[0] = time.time()
        if new_state == "listening":
            logger.info("Session started (agent state = listening)")
        # Greeting just finished: state went from speaking -> listening and we sent the greeting
        if (
            old_state == "speaking"
            and new_state == "listening"
            and greeting_sent[0]
        ):
            greeting_done[0] = True
            logger.info("Greeting done — now accepting user input")
        if ev.new_state == "listening" and not greeting_sent[0]:
            greeting_sent[0] = True

            async def delayed_greeting():
                await asyncio.sleep(5)  # Give Simli more time to fully connect
                try:
                    session.say(greeting)
                    logger.info("Greeting sent via session.say(GREETING)")
                    await asyncio.sleep(1)  # Brief pause before session starts listening
                except RuntimeError as e:
                    if "AgentSession isn't running" in str(e) or "AgentSession is closing" in str(e):
                        logger.info("Skipping greeting — session no longer running")
                    else:
                        raise
                except Exception as e:
                    logger.error("Failed to say greeting: %s", e)

            try:
                asyncio.get_running_loop().create_task(delayed_greeting())
            except Exception as e:
                logger.exception("Failed to schedule greeting: %s", e)

    session.on("agent_state_changed", on_agent_state_changed)

    async def send_ui_update(room_obj, concept=None, score=None):
        """Send concept_covered or understanding_score to frontend via data channel."""
        try:
            if concept:
                payload = json.dumps({"type": "concept_covered", "concept": concept})
                await room_obj.local_participant.publish_data(payload.encode(), reliable=True)
            if score is not None:
                payload = json.dumps({"type": "understanding_score", "score": min(5, max(1, score))})
                await room_obj.local_participant.publish_data(payload.encode(), reliable=True)
        except Exception as e:
            logger.debug("send_ui_update: %s", e)

    current_topic = subject
    TOPIC_KEYWORDS = {
        "fractions": ["fraction", "numerator", "denominator"],
        "cell-mitosis": ["mitosis", "cell", "division", "prophase", "metaphase"],
        "photosynthesis": ["photosynthesis", "chlorophyll", "plant", "sunlight"],
    }

    @ctx.room.on("data_received")
    def on_data(packet):
        try:
            payload = json.loads(packet.data.decode())
            if payload.get("type") == "hint_request":
                async def handle_hint():
                    try:
                        session.say(
                            "Here's a nudge in the right direction — without giving it away:",
                            add_to_chat_ctx=True,
                        )
                        session.generate_reply(
                            instructions="Give a single Socratic hint question that nudges without revealing the answer. Keep it to one sentence."
                        )
                    except RuntimeError as e:
                        if "isn't running" not in str(e) and "is closing" not in str(e):
                            raise

                asyncio.get_running_loop().create_task(handle_hint())
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.debug("data_received parse: %s", e)

    def _check_topic_switch(transcript: str):
        nonlocal current_topic
        t = (transcript or "").lower()
        for topic, keywords in TOPIC_KEYWORDS.items():
            if topic != current_topic and any(k in t for k in keywords):
                current_topic = topic
                display = topic.replace("-", " ")
                display = display.title()
                async def do_switch():
                    try:
                        session.generate_reply(
                            instructions=f"The student wants to switch to {display}. Acknowledge the switch warmly and ask your first Socratic question about {display} at {grade} grade level."
                        )
                    except Exception as e:
                        logger.debug("topic switch: %s", e)
                try:
                    asyncio.get_running_loop().create_task(do_switch())
                except Exception:
                    pass
                break

    def _original_on_user_transcribed(ev):
        on_user_transcribed(ev)
        transcript = getattr(ev, "transcript", "") or ""
        if transcript:
            _check_topic_switch(transcript)

    try:
        session.off("user_input_transcribed", on_user_transcribed)
    except Exception:
        pass
    session.on("user_input_transcribed", _original_on_user_transcribed)

    def _on_agent_state_for_ui(ev):
        old_state = getattr(ev, "old_state", None)
        new_state = ev.new_state
        if old_state == "speaking" and new_state == "listening":
            # Only send score after student has spoken — avoid jumping to 4 on greeting
            if student_ever_responded[0]:
                try:
                    asyncio.get_running_loop().create_task(
                        send_ui_update(ctx.room, score=4)
                    )
                except Exception:
                    pass

    session.on("agent_state_changed", _on_agent_state_for_ui)

    def on_session_error(ev):
        logger.error("session error event: %s", getattr(ev, "error", ev))

    session.on("error", on_session_error)

    def on_user_transcribed(ev):
        transcript = (getattr(ev, "transcript", "") or "").strip()
        logger.info(
            "[LATENCY] user transcript received t=%.3f is_final=%s transcript=%r",
            time.time(),
            getattr(ev, "is_final", None),
            (getattr(ev, "transcript", "") or "")[:100],
        )
        if transcript:
            last_student_response_time[0] = time.time()
            student_ever_responded[0] = True
            rephrased_done[0] = False

    async def inactivity_monitor():
        # Wait until greeting is done before starting
        while not greeting_done[0]:
            await asyncio.sleep(1)
        last_student_response_time[0] = time.time()  # reset clock after greeting

        while True:
            await asyncio.sleep(5)
            if not greeting_done[0]:
                continue
            elapsed = time.time() - last_student_response_time[0]
            if elapsed >= 60:
                logger.info("[Timeout] No response for 60s, ending session")
                try:
                    await ctx.room.local_participant.publish_data(
                        json.dumps({
                            "type": "session_timeout",
                            "student_ever_responded": student_ever_responded[0],
                        }).encode(),
                        reliable=True,
                    )
                except Exception as e:
                    logger.debug("publish session_timeout: %s", e)
                await asyncio.sleep(1)
                ctx.shutdown(reason="session_timeout")
                return
            elif elapsed >= 15 and not rephrased_done[0]:
                rephrased_done[0] = True
                logger.info("[Timeout] No response for 15s, rephrasing")
                try:
                    await session.generate_reply(
                        instructions="The student hasn't responded in 15 seconds. Gently rephrase your last question in a simpler way, or ask if they need a hint. Keep it encouraging and brief."
                    )
                except RuntimeError as e:
                    if "isn't running" not in str(e) and "is closing" not in str(e):
                        raise

    agent = Agent(
        instructions=system_prompt,
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        allow_interruptions=False,  # Background noise should not interrupt tutor
    )

    # Simli avatar — native LiveKit plugin; publishes video (and audio) to the room
    simli_avatar = simli.AvatarSession(
        simli_config=simli.SimliConfig(
            api_key=os.getenv("SIMLI_API_KEY"),
            face_id=os.getenv("SIMLI_FACE_ID"),
        ),
    )
    logger.info("Starting Simli avatar...")
    try:
        await simli_avatar.start(session, room=ctx.room)
        logger.info("Simli avatar started successfully")
    except Exception as e:
        logger.error(f"Simli avatar failed to start: {e}", exc_info=True)

    asyncio.create_task(inactivity_monitor())
    logger.info("Calling session.start(agent=..., room=...)")
    await session.start(
        agent=agent,
        room=ctx.room,
    )
    logger.info("session.start() returned (session ended)")


def prewarm(proc):
    """Preload VAD for faster startup — tightened for lower latency."""
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.05,     # was 0.1
        min_silence_duration=0.2,     # was 0.3 — cut off silence faster
        prefix_padding_duration=0.1,  # was 0.2
        activation_threshold=0.6,     # was 0.55
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="tutor",
        )
    )
