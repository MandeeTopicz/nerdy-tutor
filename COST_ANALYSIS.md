# Cost Analysis

Per-session estimate based on a 10-minute tutoring session.

| Service | Usage | Unit Price | Cost |
|---|---|---|---|
| Deepgram Nova-3 (STT) | 10 min audio | $0.0043/min | $0.043 |
| Groq Llama-3.3-70b (LLM) | ~2,500 tokens | $0.0008/1K tokens | $0.002 |
| Cartesia Sonic-3 (TTS) | ~1,000 chars | $0.015/1K chars | $0.015 |
| Simli (avatar) | 10 min | ~$0.005/min | $0.050 |
| Anthropic Claude Haiku (summary) | ~500 tokens | $0.0008/1K tokens | $0.001 |
| **Total** | | | **~$0.111** |

## Scale Projections

| Volume | Monthly Cost |
|---|---|
| 10 sessions/day | ~$33 |
| 100 sessions/day | ~$333 |
| 1,000 sessions/day | ~$3,330 |

## Cost Drivers

Simli is the dominant cost at ~45% of per-session spend. Removing the avatar and replacing with audio-only reduces cost to ~$0.061/session. Deepgram at ~39% is the second largest driver — switching to a lower-tier STT model could reduce this but would increase latency.
