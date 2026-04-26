from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field


class RuntimeMode(str, Enum):
    VERCEL = "vercel"


class CameraMode(str, Enum):
    WEBCAM = "webcam"
    PROFESSIONAL_UNAVAILABLE_ON_VERCEL = "professional_unavailable_on_vercel"


class BoothStatus(BaseModel):
    ok: bool = True
    runtime_mode: RuntimeMode = RuntimeMode.VERCEL
    camera_mode: CameraMode = CameraMode.WEBCAM
    camera_ready: bool = True
    battery_percent: int | None = None
    printer_ready: bool = False
    printer_queue: int = 0
    voice_ready: bool = True
    ai_ready: bool = True
    message: str = "KoGraph Vercel Python API ready"


class VoiceCommandRequest(BaseModel):
    command: str = Field(min_length=1, max_length=240)
    booth_id: str | None = None
    session_code: str | None = None


class VoiceCommandResponse(BaseModel):
    ok: bool
    intent: str
    target: str | None = None
    action: Literal[
        "upscale_hd",
        "change_background",
        "style_anime",
        "decorate_face",
        "apply_filter",
        "print_now",
        "send_whatsapp",
        "unknown"
    ]
    reply: str
    payload: dict[str, Any] = Field(default_factory=dict)
