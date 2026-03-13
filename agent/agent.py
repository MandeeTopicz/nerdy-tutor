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
import re
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

# Session state: intro → name → topic → grade → subject (if unclear) → tutoring
INTRODUCING = "INTRODUCING"
CAPTURING_NAME = "CAPTURING_NAME"
CAPTURING_TOPIC = "CAPTURING_TOPIC"
CAPTURING_GRADE = "CAPTURING_GRADE"
CAPTURING_SUBJECT = "CAPTURING_SUBJECT"
TUTORING = "TUTORING"

# Grade keys and subject categories
GRADE_6, GRADE_7, GRADE_8, GRADE_9, GRADE_10, GRADE_11, GRADE_12 = (
    "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12"
)
MATH, SCIENCE, ENGLISH = "MATH", "SCIENCE", "ENGLISH"

INTRO_TEXT = (
    "Hey there, welcome to your tutoring session. Before we get started, what's your name?"
)

# Grade-level profiles: general + subject-specific instructions per grade
GRADE_PROFILES = {
    GRADE_6: {
        "general": (
            "Vocabulary: simple everyday language only; define every new word. "
            "Concepts: one concept at a time; heavy use of real-world analogies. "
            "Tone: warm, encouraging, very patient. "
            "Response length: 2 sentences max before checking in. "
            "Socratic questions: 'What do you already know about this?', 'Can you describe it in your own words?', 'What does this remind you of?'"
        ),
        "math": "Math: whole numbers, fractions, basic ratios — use pizza/money analogies.",
        "science": "Science: observable phenomena only; no abstract theory.",
        "english": "English: basic story elements, main idea, simple inference.",
    },
    GRADE_7: {
        "general": (
            "Vocabulary: introduce simple subject terms with definitions. "
            "Concepts: up to 2 connected concepts; use comparisons to known ideas. "
            "Tone: encouraging, slightly more academic. "
            "Response length: 2-3 sentences before checking in. "
            "Socratic questions: 'Why do you think that happens?', 'What would change if...?', 'Can you give me an example?'"
        ),
        "math": "Math: proportions, basic algebra intro, negative numbers.",
        "science": "Science: begin cause and effect reasoning.",
        "english": "English: author's purpose, text structure, basic theme.",
    },
    GRADE_8: {
        "general": (
            "Vocabulary: use subject-specific terms; define unfamiliar ones inline. "
            "Concepts: 2-3 connected concepts; introduce simple formulas and notation. "
            "Tone: academic but approachable. "
            "Response length: 3 sentences before checking in. "
            "Socratic questions: \"What's the relationship between these two ideas?\", 'How did you arrive at that?', 'What pattern do you notice?'"
        ),
        "math": "Math: linear equations, slope, intro to functions.",
        "science": "Science: basic scientific method, variables, simple data interpretation.",
        "english": "English: theme development, character motivation, evidence-based claims.",
    },
    GRADE_9: {
        "general": (
            "Vocabulary: full subject terminology expected; minimal hand-holding on definitions. "
            "Concepts: multi-step reasoning; connecting concepts across topics. "
            "Tone: academic, peer-like. "
            "Response length: 3-4 sentences before checking in. "
            "Socratic questions: 'What assumptions are you making?', 'How would you test that?', 'What evidence supports that?'"
        ),
        "math": "Math: systems of equations, quadratics intro, geometric proofs.",
        "science": "Science: hypothesis formation, controlled experiments, basic chemistry/physics concepts.",
        "english": "English: argumentative analysis, rhetorical devices, textual evidence.",
    },
    GRADE_10: {
        "general": (
            "Vocabulary: college-prep terminology; no inline definitions unless highly specialized. "
            "Concepts: abstract reasoning introduced; exceptions and edge cases. "
            "Tone: academic, intellectually challenging. "
            "Response length: 3-4 sentences; push student to elaborate before confirming. "
            "Socratic questions: 'What are the limitations of that approach?', 'Can you think of a counterexample?', 'How does this connect to what you already know?'"
        ),
        "math": "Math: advanced algebra, intro to trigonometry, probability.",
        "science": "Science: molecular biology, chemical reactions, Newtonian physics.",
        "english": "English: literary theory basics, complex theme analysis, synthesis across texts.",
    },
    GRADE_11: {
        "general": (
            "Vocabulary: discipline-specific academic language; assumes strong base knowledge. "
            "Concepts: nuanced, multi-layered reasoning; compare and contrast frameworks. "
            "Tone: near-collegiate, intellectually rigorous. "
            "Response length: 4 sentences; expect student to drive reasoning with minimal prompting. "
            "Socratic questions: \"What's the underlying principle at work here?\", 'How would an expert approach this differently?', 'What would disprove your reasoning?'"
        ),
        "math": "Math: pre-calculus, logarithms, complex functions.",
        "science": "Science: advanced biology/chemistry/physics, data analysis, scientific writing.",
        "english": "English: rhetorical analysis, research synthesis, AP-level argumentation.",
    },
    GRADE_12: {
        "general": (
            "Vocabulary: full college-level academic and subject-specific language. "
            "Concepts: abstract, theoretical, and applied; multi-step problems without scaffolding. "
            "Tone: collegiate, intellectual peer. "
            "Response length: 4-5 sentences; student expected to reason independently. "
            "Socratic questions: \"What's the theoretical basis for that?\", 'How would you defend that position?', 'What are the real-world implications?', 'How would you prove that rigorously?'"
        ),
        "math": "Math: calculus concepts, limits, derivatives, intro to proofs.",
        "science": "Science: research-level reasoning, experimental design, advanced data interpretation.",
        "english": "English: scholarly analysis, original argumentation, cross-disciplinary synthesis.",
    },
}


def _parse_grade_from_transcript(transcript: str):
    """Returns (grade_key or None, invalid: bool, need_middle_school_clarify: bool)."""
    t = (transcript or "").strip().lower()
    if not t:
        return None, False, False
    if "freshman" in t or "freshmen" in t:
        return "GRADE_9", False, False
    if "sophomore" in t:
        return "GRADE_10", False, False
    if "junior" in t:
        return "GRADE_11", False, False
    if "senior" in t:
        return "GRADE_12", False, False
    if "middle school" in t:
        return None, False, True
    if "12" in t or "twelve" in t or "12th" in t or "twelfth" in t:
        return "GRADE_12", False, False
    if "11" in t or "eleven" in t or "11th" in t or "eleventh" in t:
        return "GRADE_11", False, False
    if "10" in t or "ten" in t or "10th" in t or "tenth" in t:
        return "GRADE_10", False, False
    if "9" in t or "nine" in t or "9th" in t or "ninth" in t:
        return "GRADE_9", False, False
    if "8" in t or "eight" in t or "8th" in t or "eighth" in t:
        return "GRADE_8", False, False
    if "7" in t or "seven" in t or "7th" in t or "seventh" in t:
        return "GRADE_7", False, False
    if re.search(r"\b6\b", t) or "6th" in t or "six" in t or "sixth" in t:
        return "GRADE_6", False, False
    m = re.search(r"\b(\d{1,2})\b", t)
    if m:
        num = int(m.group(1))
        if 6 <= num <= 12:
            return f"GRADE_{num}", False, False
        return None, True, False
    return None, True, False


def _detect_subject_from_topic(topic_text: str):
    """Detect MATH, SCIENCE, or ENGLISH from topic string. Returns subject key or None if unclear."""
    t = (topic_text or "").lower()
    if not t:
        return None
    math_words = (
        "math", "maths", "algebra", "geometry", "fraction", "fractions", "equation", "calculus",
        "number", "numbers", "ratio", "ratios", "percent", "trigonometry", "graph"
    )
    science_words = (
        "science", "biology", "chemistry", "physics", "cell", "mitosis", "photosynthesis",
        "atom", "molecule", "experiment", "scientific", "earth", "space", "organism"
    )
    english_words = (
        "english", "reading", "writing", "literature", "grammar", "essay", "story", "poem",
        "author", "theme", "character", "rhetoric", "argument", "comprehension"
    )
    math_hits = sum(1 for w in math_words if w in t)
    science_hits = sum(1 for w in science_words if w in t)
    english_hits = sum(1 for w in english_words if w in t)
    if math_hits >= 1 and math_hits >= science_hits and math_hits >= english_hits:
        return MATH
    if science_hits >= 1 and science_hits >= math_hits and science_hits >= english_hits:
        return SCIENCE
    if english_hits >= 1 and english_hits >= math_hits and english_hits >= science_hits:
        return ENGLISH
    return None


def _build_tutoring_prompt(student_name: str, grade_key: str, subject: str, topic_text: str) -> str:
    """Build system prompt from grade profile and subject."""
    profile = GRADE_PROFILES.get(grade_key, GRADE_PROFILES[GRADE_8])
    subject_lower = subject.lower() if subject else "math"
    subject_line = profile.get(subject_lower, profile.get("math", ""))
    grade_label = grade_key.replace("GRADE_", "") + "th" if grade_key else "8th"
    return (
        f"You are a Socratic tutor named Nerd helping {student_name}, a {grade_label} grade student, with {subject}. "
        f"Their topic is: {topic_text or 'general'}.\n\n"
        f"{profile['general']}\n\n"
        f"{subject_line}\n\n"
        "Always respond in 2-4 sentences max. Never give the answer directly — guide the student "
        "to discover it. Correct misconceptions immediately and clearly. Do not offer unsolicited "
        "information. After every response, ask one follow-up question to check understanding."
    )


def _build_socratic_prompt(subject: str, grade: str, student_name: str = "Student") -> str:
    """Legacy builder for tests; uses generic 8th-grade style."""
    return _build_tutoring_prompt(student_name, GRADE_8, subject, subject)


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
    print(f"[DEBUG] room metadata: {metadata}")
    print(f"[DEBUG] grade from metadata: {grade}")
    print(f"[DEBUG] subject from metadata: {subject}")
    logger.info("Room metadata: grade=%s subject=%s", grade, subject)

    session_state_ref = [INTRODUCING]
    student_name_ref = [None]  # str | None
    topic_ref = [None]  # raw topic text from student
    grade_ref = [None]  # GRADE_6 .. GRADE_12
    subject_ref = [None]  # MATH | SCIENCE | ENGLISH, set when entering TUTORING
    grade_instructions_set = [False]  # True after we set grade_capture_instructions

    intro_silent_instructions = (
        "You are Nerd in setup mode. The introduction is playing. Do not respond to user input. Say nothing."
    )
    name_capture_instructions = (
        "Whatever the user just said is their name. Respond with exactly: Great to meet you, [use the exact name they said]! What subject or topic would you like to work on today?"
    )
    topic_capture_instructions = (
        "The user told you their topic. Acknowledge in one short sentence and ask: What grade are you in?"
    )
    grade_capture_instructions = (
        "The user is telling you their grade. Accept only grades 6, 7, 8, 9, 10, 11, or 12. "
        "Map freshman or ninth to 9, sophomore to 10, junior to 11, senior to 12. "
        "If they say a grade outside 6-12, say exactly: I'm designed to help students in grades 6 through 12. What grade are you in? "
        "If they say middle school, ask: Which grade — 6, 7, or 8? "
        "Otherwise acknowledge their grade in one short sentence and say you're ready to start."
    )
    subject_clarify_instructions = (
        "Ask the student to choose: Are we working on math, science, or English today? "
        "Respond briefly based on their answer and confirm we're starting."
    )

    # Deepgram STT — Nova-3 optimized for latency (target <150ms, max <300ms).
    # endpointing_ms=300; vad_events=True. (utterance_end_ms not exposed by LiveKit Deepgram plugin.)
    stt = deepgram.STT(
        model="nova-3",
        language="en",
        interim_results=True,
        endpointing_ms=300,
        punctuate=False,
        smart_format=False,  # disable — adds latency
        no_delay=True,       # request lowest latency mode
        vad_events=True,
    )

    # LLM: Groq Llama-3.3-70b (OpenAI-compatible API). Output streams token-by-token to TTS
    # via livekit-agents pipeline (no full-response buffering).
    groq_base_url = "https://api.groq.com/openai/v1"
    groq_model = "llama-3.3-70b-versatile"
    llm = openai.LLM(
        model=groq_model,
        api_key=os.environ.get("GROQ_API_KEY"),
        base_url=groq_base_url,
    )
    logger.info("LLM configured: base_url=%s model=%s", groq_base_url, groq_model)

    # TTS: Cartesia Sonic 3 streaming — receives streamed tokens from LLM in real time (no sentence
    # buffering; pipeline uses AsyncIterable[str] from LLM -> TTS). 16kHz to match Simli's native rate.
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

    # Pipeline stage instrumentation: baseline = speech_end_detected (0ms); log ms since then per stage
    latency_t0_ref = [None]  # time when user stopped speaking (baseline for this turn)
    latency_stt_ms_ref = [None]  # transcription_delay in ms (from EOU)
    latency_llm_ttft_ref = [None]  # LLM time-to-first-token in sec (for tts_first_chunk calc)

    def on_metrics(ev):
        try:
            ts = time.time()
            m = ev.metrics
            if m is None:
                return
            if hasattr(m, "type") and m.type == "eou_metrics":
                eou = m
                # Baseline for this turn: speech end time
                latency_t0_ref[0] = ts - eou.end_of_utterance_delay - eou.transcription_delay
                stt_ms = eou.transcription_delay * 1000
                latency_stt_ms_ref[0] = stt_ms
                latency_llm_ttft_ref[0] = None
                logger.info("[LATENCY] speech_end_detected 0ms (baseline)")
                logger.info("[LATENCY] stt_transcript_received %.0fms", stt_ms)
                logger.info(
                    "[EOU] end_of_utterance_delay=%.0fms | transcription_delay=%.0fms",
                    eou.end_of_utterance_delay * 1000,
                    eou.transcription_delay * 1000,
                )
                return
            d = getattr(m, "model_dump", None) or getattr(m, "dict", lambda: {})()
            if not isinstance(d, dict):
                return
            if hasattr(m, "type") and m.type == "stt_metrics":
                audio_dur = getattr(m, "audio_duration", None)
                if audio_dur is not None:
                    logger.info("[STT] audio_duration=%s (user speech length)", f"{audio_dur * 1000:.0f}ms")
            llm_ttft = d.get("llm_node_ttft") or d.get("ttft")  # assistant or LLMMetrics
            tts_ttfb = d.get("tts_node_ttfb") or d.get("ttfb")  # assistant or TTSMetrics
            if llm_ttft is not None and latency_t0_ref[0] is not None and latency_stt_ms_ref[0] is not None:
                latency_llm_ttft_ref[0] = llm_ttft
                elapsed_ms = latency_stt_ms_ref[0] + llm_ttft * 1000
                logger.info("[LATENCY] llm_first_token %.0fms", elapsed_ms)
            if tts_ttfb is not None and latency_t0_ref[0] is not None and latency_stt_ms_ref[0] is not None:
                stt_sec = latency_stt_ms_ref[0] / 1000.0
                llm_sec = (latency_llm_ttft_ref[0] or 0.0)
                elapsed_ms = (stt_sec + llm_sec + tts_ttfb) * 1000
                logger.info("[LATENCY] tts_first_chunk %.0fms", elapsed_ms)
            stt_val = d.get("transcription_delay") or d.get("duration")
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
            if latency_t0_ref[0] is not None:
                elapsed_ms = (time.time() - latency_t0_ref[0]) * 1000
                logger.info("[LATENCY] avatar_audio_start %.0fms", elapsed_ms)
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
            elif session_state_ref[0] == CAPTURING_GRADE and not grade_instructions_set[0]:
                grade_instructions_set[0] = True
                logger.info("Grade question finished — now listening for grade")
                async def _set_grade_capture():
                    try:
                        await agent.update_instructions(grade_capture_instructions)
                    except Exception as e:
                        logger.debug("update_instructions grade_capture: %s", e)
                try:
                    asyncio.get_running_loop().create_task(_set_grade_capture())
                except Exception as e:
                    logger.exception("Schedule grade_capture instructions: %s", e)
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

    current_topic = subject  # from room; updated when we capture topic or switch
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
                topic_ref[0] = topic
                detected_subject = _detect_subject_from_topic(topic)
                if detected_subject:
                    subject_ref[0] = detected_subject
                display = topic.replace("-", " ")
                display = display.title()
                gkey = grade_ref[0] or GRADE_8
                subj = subject_ref[0] or MATH
                async def do_switch():
                    try:
                        await agent.update_instructions(
                            _build_tutoring_prompt(
                                student_name_ref[0] or "Student",
                                gkey,
                                subj,
                                topic_ref[0] or topic,
                            )
                        )
                        session.generate_reply(
                            instructions=f"The student wants to switch to {display}. Acknowledge the switch warmly and ask your first Socratic question about {display} at their grade level."
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
            topic_ref[0] = transcript
            session_state_ref[0] = CAPTURING_GRADE
            current_topic = transcript
            logger.info("Captured topic, now capturing grade: topic=%s", topic_ref[0])
        elif state == CAPTURING_GRADE and is_final and transcript:
            grade_key, invalid, need_middle_school = _parse_grade_from_transcript(transcript)
            if invalid or need_middle_school:
                logger.info("Grade invalid or middle-school ambiguous, staying in CAPTURING_GRADE")
            elif grade_key:
                grade_ref[0] = grade_key
                logger.info("Captured grade: %s", grade_ref[0])
                detected = _detect_subject_from_topic(topic_ref[0] or "")
                if detected:
                    subject_ref[0] = detected
                    session_state_ref[0] = TUTORING
                    logger.info("Subject detected from topic: %s, starting tutoring", subject_ref[0])
                    async def _start_tutoring():
                        try:
                            await agent.update_instructions(
                                _build_tutoring_prompt(
                                    student_name_ref[0] or "Student",
                                    grade_ref[0],
                                    subject_ref[0],
                                    topic_ref[0] or "",
                                )
                            )
                        except Exception as e:
                            logger.debug("update_instructions tutoring: %s", e)
                    try:
                        asyncio.get_running_loop().create_task(_start_tutoring())
                    except Exception as e:
                        logger.exception("Schedule tutoring instructions: %s", e)
                else:
                    session_state_ref[0] = CAPTURING_SUBJECT
                    logger.info("Subject unclear, capturing subject")
                    async def _set_subject_clarify():
                        try:
                            await agent.update_instructions(subject_clarify_instructions)
                        except Exception as e:
                            logger.debug("update_instructions subject_clarify: %s", e)
                    try:
                        asyncio.get_running_loop().create_task(_set_subject_clarify())
                    except Exception as e:
                        logger.exception("Schedule subject_clarify: %s", e)
        elif state == CAPTURING_SUBJECT and is_final and transcript:
            t = transcript.lower()
            if "math" in t or "mathematics" in t:
                subject_ref[0] = MATH
            elif "science" in t:
                subject_ref[0] = SCIENCE
            elif "english" in t or "reading" in t or "writing" in t or "literature" in t:
                subject_ref[0] = ENGLISH
            if subject_ref[0]:
                session_state_ref[0] = TUTORING
                logger.info("Captured subject: %s, starting tutoring", subject_ref[0])
                async def _start_tutoring_from_subject():
                    try:
                        await agent.update_instructions(
                            _build_tutoring_prompt(
                                student_name_ref[0] or "Student",
                                grade_ref[0] or GRADE_8,
                                subject_ref[0],
                                topic_ref[0] or "",
                            )
                        )
                    except Exception as e:
                        logger.debug("update_instructions tutoring: %s", e)
                try:
                    asyncio.get_running_loop().create_task(_start_tutoring_from_subject())
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
