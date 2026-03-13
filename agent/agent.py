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

# Session state: intro (no STT response) → capture name → capture topic → tutoring
INTRODUCING = "INTRODUCING"
CAPTURING_NAME = "CAPTURING_NAME"
CAPTURING_TOPIC = "CAPTURING_TOPIC"
TUTORING = "TUTORING"

INTRO_TEXT = (
    "Hi! I'm Nerd, your AI tutor. I'm here to help you learn anything you're curious about. What's your name?"
)


def _build_socratic_prompt(subject: str, grade: str, student_name: str = "Student") -> str:
    return f"""You are NerdyTutor, an AI tutor. The student's name is {student_name}. Teach {subject} at a {grade} grade level.

Use the Socratic method: ask guiding questions; do not just give answers. Every response should end with a question when appropriate.
Keep responses to 2-4 sentences maximum per turn. Use age-appropriate language (middle school level unless the student indicates otherwise).
Be accuracy-first: correct misconceptions directly and clearly. Answer what was asked, then check in—no unsolicited information.
Never repeat back what the student just said. When they're wrong, ask a question that reveals the error; when they're right, ask them to explain why. When they're stuck, ask a simpler bridging question."""


def _build_greeting(subject: str) -> str:
    return f"Hi! I'm your tutor today. We're learning about {subject}. What would you like to explore first?"


# Module-level constants for tests and reuse (default subject/grade)
SOCRATIC_PROMPT = _build_socratic_prompt("fractions", "8th", "Student")
GREETING = _build_greeting("fractions")


async def entrypoint(ctx: JobContext):
    """Connect to room and run the voice agent."""
    await ctx.connect()

    last_student_response_time = [time.time()]
    student_ever_responded = [False]

    metadata = json.loads(ctx.room.metadata or "{}")
    grade = metadata.get("grade", "8th")
    subject = metadata.get("subject", "fractions")
    logger.info("Room metadata: grade=%s subject=%s", grade, subject)

    session_state_ref = [INTRODUCING]
    student_name_ref = [None]  # str | None, set when we capture name
    subject_ref = [subject]  # may be updated from student's topic choice

    intro_silent_instructions = (
        "You are Nerd in setup mode. The introduction is playing. Do not respond to user input. Say nothing."
    )
    name_capture_instructions = (
        "Whatever the user just said is their name. Respond with exactly: Great to meet you, [use the exact name they said]! What subject or topic would you like to work on today?"
    )
    topic_capture_instructions = (
        "The user will tell you what subject or topic they want. Acknowledge in one short sentence and say you're ready to start. One sentence only."
    )

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

    # TTS: Cartesia Sonic 3 streaming — 16kHz to match Simli's native rate (avoids resampling)
    tts = cartesia.TTS(
        model="sonic-3",
        voice="79a125e8-cd45-4c13-8a67-188112f4dd22",  # friendly voice
        sample_rate=16000,  # match Simli SAMPLE_RATE to skip resampling
    )

    # Silero VAD — less sensitive to reduce background/ambient noise pickup
    vad = ctx.proc.userdata["vad"]

    session = AgentSession(
        vad=vad,
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection="vad",
        allow_interruptions=True,   # Let students interrupt — avoids buffering speech and inflating STT latency
        aec_warmup_duration=None,
        min_endpointing_delay=0.5,  # wait at least 500ms of silence before committing
        max_endpointing_delay=1.5,  # allow up to 1.5s for mid-sentence pauses
        preemptive_generation=True,
        user_away_timeout=None,  # we handle inactivity ourselves in inactivity_monitor (20s check-in, ~45s close)
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

    intro_sent = [False]  # True after we sent INTRO_TEXT
    greeting_done = [False]  # True when intro has finished playing
    second_30s_after_check_in = [False]  # True after we said "are you still there?"; next 30s = close

    async def say_and_wait(text: str, timeout: float = 15.0):
        """Call session.say() and wait for the agent to finish speaking (speaking → listening)."""
        done = asyncio.Event()

        def _on_state(ev):
            old = getattr(ev, "old_state", None)
            if old == "speaking" and ev.new_state == "listening":
                done.set()

        session.on("agent_state_changed", _on_state)
        try:
            session.say(text)
            await asyncio.wait_for(done.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("[Timeout] say_and_wait timed out after %.0fs for: %s", timeout, text[:60])
        finally:
            session.off("agent_state_changed", _on_state)

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
            last_student_response_time[0] = time.time()
            if session_state_ref[0] == INTRODUCING:
                session_state_ref[0] = CAPTURING_NAME
                greeting_done[0] = True
                logger.info("Intro done — now capturing name")
                async def _update_name_capture():
                    try:
                        await agent.update_instructions(name_capture_instructions)
                    except Exception as e:
                        logger.debug("update_instructions name_capture: %s", e)
                try:
                    asyncio.get_running_loop().create_task(_update_name_capture())
                except Exception as e:
                    logger.exception("Schedule name_capture instructions: %s", e)
            elif session_state_ref[0] == CAPTURING_NAME:
                session_state_ref[0] = CAPTURING_TOPIC
                logger.info("Name response done — now capturing topic")
                async def _update_topic_capture():
                    try:
                        await agent.update_instructions(topic_capture_instructions)
                    except Exception as e:
                        logger.debug("update_instructions topic_capture: %s", e)
                try:
                    asyncio.get_running_loop().create_task(_update_topic_capture())
                except Exception as e:
                    logger.exception("Schedule topic_capture instructions: %s", e)
        if new_state == "listening":
            logger.info("Session started (agent state = listening)")
        if new_state == "listening" and not intro_sent[0]:
            intro_sent[0] = True
            try:
                session.say(INTRO_TEXT)
                logger.info("Intro sent via session.say(INTRO_TEXT)")
            except RuntimeError as e:
                if "AgentSession isn't running" in str(e) or "AgentSession is closing" in str(e):
                    logger.info("Skipping intro — session no longer running")
                else:
                    raise
            except Exception as e:
                logger.error("Failed to say intro: %s", e)

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

    current_topic = subject_ref[0]
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
                        session.generate_reply(
                            instructions="The student asked for a hint. Give a single short Socratic hint that nudges them toward the answer without revealing it. Start naturally, do not say 'here is a hint'."
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
                subject_ref[0] = topic
                display = topic.replace("-", " ")
                display = display.title()
                async def do_switch():
                    try:
                        await agent.update_instructions(
                            _build_socratic_prompt(topic, grade, student_name_ref[0] or "Student")
                        )
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
        nonlocal current_topic
        transcript = (getattr(ev, "transcript", "") or "").strip()
        is_final = getattr(ev, "is_final", False)
        state = session_state_ref[0]
        if state == CAPTURING_NAME and is_final and transcript and student_name_ref[0] is None:
            student_name_ref[0] = transcript
            logger.info("Captured student name: %s", student_name_ref[0])
        elif state == CAPTURING_TOPIC and is_final and transcript:
            subject_ref[0] = transcript
            session_state_ref[0] = TUTORING
            current_topic = subject_ref[0]
            logger.info("Captured topic, starting tutoring: subject=%s", subject_ref[0])
            async def _switch_to_tutoring():
                try:
                    await agent.update_instructions(
                        _build_socratic_prompt(subject_ref[0], grade, student_name_ref[0] or "Student")
                    )
                except Exception as e:
                    logger.debug("update_instructions tutoring: %s", e)
            try:
                asyncio.get_running_loop().create_task(_switch_to_tutoring())
            except Exception as e:
                logger.exception("Schedule tutoring instructions: %s", e)
        on_user_transcribed(ev)
        if transcript and state == TUTORING:
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
            if session_state_ref[0] == TUTORING and student_ever_responded[0]:
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
            second_30s_after_check_in[0] = False

    _closing_message = (
        "No worries, it looks like you stepped away. "
        "Great work today. Come back anytime to keep learning. Bye for now."
    )

    async def inactivity_monitor():
        # Wait until greeting is done before starting
        while not greeting_done[0]:
            await asyncio.sleep(1)
        last_student_response_time[0] = time.time()  # reset clock after greeting
        logger.info("[Timeout] Inactivity monitor started — first check-in at 20s, then close at 25s after check-in")

        while True:
            await asyncio.sleep(2)  # check every 2s so timers fire reliably
            if not greeting_done[0]:
                continue
            elapsed = time.time() - last_student_response_time[0]
            if second_30s_after_check_in[0]:
                # Already said "are you still there?"; 25s more with no response → warm close
                if elapsed >= 25:
                    logger.info("[Timeout] No response after check-in, ending session")
                    try:
                        await say_and_wait(_closing_message, timeout=15.0)
                    except Exception as e:
                        logger.debug("say closing: %s", e)
                    # Signal frontend AFTER speech finishes
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
            else:
                # First 20s of no response → check-in (before Simli's ~30s idle timeout drops avatar)
                if elapsed >= 20:
                    logger.info("[Timeout] No response for 20s, sending check-in")
                    try:
                        await say_and_wait(
                            "I haven't heard from you in a bit. Take your time, or let me know if you want a hint.",
                            timeout=12.0,
                        )
                    except RuntimeError as e:
                        if "isn't running" not in str(e) and "is closing" not in str(e):
                            raise
                    second_30s_after_check_in[0] = True
                    last_student_response_time[0] = time.time()

    agent = Agent(
        instructions=intro_silent_instructions,
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
        min_silence_duration=0.4,     # 400ms silence needed to mark end of speech segment
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
