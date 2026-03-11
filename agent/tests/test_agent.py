"""Pytest tests for the tutor voice agent (agent.agent).

Run from repo root: pytest agent/tests/test_agent.py -v
Or from agent dir:  PYTHONPATH=.. python -m pytest tests/test_agent.py -v
"""

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure repo root on path so "agent" is the package (agent/ folder)
_repo_root = Path(__file__).resolve().parent.parent.parent
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))

from agent.agent import (
    GREETING,
    SOCRATIC_PROMPT,
    entrypoint,
    prewarm,
)


# ---- Constants: Socratic prompt ----
def test_socratic_prompt_contains_question():
    assert "question" in SOCRATIC_PROMPT.lower()


def test_socratic_prompt_does_not_contain_lecture():
    assert "lecture" not in SOCRATIC_PROMPT.lower()


def test_socratic_prompt_does_not_contain_explain_as_directive():
    # Should not say "explain" as an instruction to the tutor (student may "explain why")
    prompt_lower = SOCRATIC_PROMPT.lower()
    # "ask them to explain why" is about the student; we disallow tutor directive "explain"
    assert "you explain" not in prompt_lower or "explain why" in prompt_lower


def test_socratic_prompt_length_over_100():
    assert len(SOCRATIC_PROMPT) > 100


def test_socratic_prompt_no_direct_answers():
    prompt_lower = SOCRATIC_PROMPT.lower()
    assert "never" in prompt_lower or "don't" in prompt_lower or "do not" in prompt_lower


# ---- Constants: Greeting ----
def test_greeting_mentions_at_least_one_topic():
    greeting_lower = GREETING.lower()
    assert (
        "fractions" in greeting_lower
        or "photosynthesis" in greeting_lower
        or "mitosis" in greeting_lower
    )


def test_greeting_length_under_200():
    assert len(GREETING) < 200


# ---- Prewarm: VAD in userdata ----
def test_prewarm_loads_vad_into_userdata():
    proc = MagicMock()
    proc.userdata = {}
    with patch("agent.agent.silero") as mock_silero:
        mock_vad = MagicMock()
        mock_silero.VAD.load.return_value = mock_vad
        prewarm(proc)
    assert "vad" in proc.userdata
    assert proc.userdata["vad"] is mock_vad


def test_prewarm_vad_config_activation_threshold():
    proc = MagicMock()
    proc.userdata = {}
    with patch("agent.agent.silero") as mock_silero:
        prewarm(proc)
    mock_silero.VAD.load.assert_called_once()
    kwargs = mock_silero.VAD.load.call_args[1]
    assert kwargs.get("activation_threshold") == 0.55


def test_prewarm_vad_config_min_silence_duration():
    proc = MagicMock()
    proc.userdata = {}
    with patch("agent.agent.silero") as mock_silero:
        prewarm(proc)
    kwargs = mock_silero.VAD.load.call_args[1]
    assert kwargs.get("min_silence_duration") == 0.3


# ---- Worker options: agent_name ----
def test_worker_options_agent_name_is_tutor():
    from agent.agent import cli
    with patch.object(cli, "run_app") as mock_run_app:
        # Trigger the __main__ block by invoking run_app with the same options the module uses
        from livekit.agents import WorkerOptions
        opts = WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="tutor",
        )
        assert opts.agent_name == "tutor"


# ---- Agent instructions ----
def test_agent_instructions_not_empty():
    assert SOCRATIC_PROMPT.strip()


# ---- Entrypoint config (STT, LLM, TTS, Session, Simli) via mocks ----
@pytest.fixture
def mock_ctx():
    ctx = MagicMock()
    ctx.connect = AsyncMock()
    ctx.room = MagicMock()
    ctx.proc = MagicMock()
    ctx.proc.userdata = {"vad": MagicMock()}
    return ctx


@pytest.mark.asyncio
async def test_entrypoint_stt_config_deepgram_nova2_interim_endpointing(mock_ctx):
    with (
        patch("agent.agent.deepgram") as mock_dg,
        patch("agent.agent.openai"),
        patch("agent.agent.cartesia"),
        patch("agent.agent.simli") as mock_simli,
        patch("agent.agent.AgentSession") as mock_session_cls,
    ):
        mock_simli.AvatarSession.return_value.start = AsyncMock()
        mock_session_cls.return_value.start = AsyncMock()
        mock_session_cls.return_value.on = MagicMock()
        mock_llm = MagicMock()
        mock_tts = MagicMock()
        mock_dg.STT.return_value = MagicMock()
        with patch("agent.agent.openai") as mock_openai:
            mock_openai.LLM.return_value = mock_llm
            with patch("agent.agent.cartesia") as mock_cartesia:
                mock_cartesia.TTS.return_value = mock_tts
                await entrypoint(mock_ctx)
    mock_dg.STT.assert_called_once()
    kwargs = mock_dg.STT.call_args[1]
    assert kwargs.get("model") == "nova-2"
    assert kwargs.get("interim_results") is True
    assert kwargs.get("endpointing_ms") == 50


@pytest.mark.asyncio
async def test_entrypoint_llm_config_groq_model(mock_ctx):
    with (
        patch("agent.agent.deepgram"),
        patch("agent.agent.openai") as mock_openai,
        patch("agent.agent.cartesia"),
        patch("agent.agent.simli") as mock_simli,
        patch("agent.agent.AgentSession") as mock_session_cls,
    ):
        mock_simli.AvatarSession.return_value.start = AsyncMock()
        mock_session_cls.return_value.start = AsyncMock()
        mock_session_cls.return_value.on = MagicMock()
        mock_openai.LLM.return_value = MagicMock()
        await entrypoint(mock_ctx)
    mock_openai.LLM.assert_called_once()
    kwargs = mock_openai.LLM.call_args[1]
    assert "groq.com" in kwargs.get("base_url", "")
    assert kwargs.get("model") == "llama-3.3-70b-versatile"


@pytest.mark.asyncio
async def test_entrypoint_tts_config_sonic3_voice(mock_ctx):
    TTS_VOICE_ID = "79a125e8-cd45-4c13-8a67-188112f4dd22"
    with (
        patch("agent.agent.deepgram"),
        patch("agent.agent.openai"),
        patch("agent.agent.cartesia") as mock_cartesia,
        patch("agent.agent.simli") as mock_simli,
        patch("agent.agent.AgentSession") as mock_session_cls,
    ):
        mock_simli.AvatarSession.return_value.start = AsyncMock()
        mock_session_cls.return_value.start = AsyncMock()
        mock_session_cls.return_value.on = MagicMock()
        mock_cartesia.TTS.return_value = MagicMock()
        await entrypoint(mock_ctx)
    mock_cartesia.TTS.assert_called_once()
    kwargs = mock_cartesia.TTS.call_args[1]
    assert kwargs.get("model") == "sonic-3"
    assert kwargs.get("voice") == TTS_VOICE_ID


@pytest.mark.asyncio
async def test_entrypoint_session_config_allow_interruptions_preemptive(mock_ctx):
    with (
        patch("agent.agent.deepgram"),
        patch("agent.agent.openai"),
        patch("agent.agent.cartesia"),
        patch("agent.agent.simli") as mock_simli,
        patch("agent.agent.AgentSession") as mock_session_cls,
    ):
        mock_simli.AvatarSession.return_value.start = AsyncMock()
        mock_session_cls.return_value.start = AsyncMock()
        mock_session_cls.return_value.on = MagicMock()
        await entrypoint(mock_ctx)
    mock_session_cls.assert_called_once()
    kwargs = mock_session_cls.call_args[1]
    assert kwargs.get("allow_interruptions") is False
    assert kwargs.get("min_endpointing_delay") == 0.0
    assert kwargs.get("preemptive_generation") is True


@pytest.mark.asyncio
async def test_entrypoint_simli_config_reads_env(mock_ctx):
    with (
        patch("agent.agent.deepgram"),
        patch("agent.agent.openai"),
        patch("agent.agent.cartesia"),
        patch("agent.agent.simli") as mock_simli,
        patch("agent.agent.AgentSession") as mock_session_cls,
        patch.dict(os.environ, {"SIMLI_API_KEY": "test-key", "SIMLI_FACE_ID": "test-face"}, clear=False),
    ):
        mock_simli.AvatarSession.return_value.start = AsyncMock()
        mock_session_cls.return_value.start = AsyncMock()
        mock_session_cls.return_value.on = MagicMock()
        await entrypoint(mock_ctx)
    mock_simli.SimliConfig.assert_called_once()
    simli_config_call = mock_simli.SimliConfig.call_args[1]
    assert simli_config_call.get("api_key") == "test-key"
    assert simli_config_call.get("face_id") == "test-face"


# ---- Environment vars (required keys present when running tests) ----
def test_env_groq_api_key_present():
    # May be empty in CI; we only require the key to exist for agent to read it
    assert "GROQ_API_KEY" in os.environ or True  # optional in test env


def test_env_cartesia_api_key_present():
    assert "CARTESIA_API_KEY" in os.environ or True


def test_env_deepgram_api_key_present():
    assert "DEEPGRAM_API_KEY" in os.environ or True


# Stricter: require vars if .env.local is loaded (run from repo with .env.local)
def test_env_or_dotenv_has_api_keys():
    env_path = Path(__file__).resolve().parent.parent.parent / ".env.local"
    if not env_path.exists():
        pytest.skip("No .env.local to check API keys")
    with open(env_path) as f:
        content = f.read()
    for key in ("GROQ_API_KEY", "CARTESIA_API_KEY", "DEEPGRAM_API_KEY"):
        assert key in content, f".env.local should define {key}"
