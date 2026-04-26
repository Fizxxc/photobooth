from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class BoothEventType(str, Enum):
    READY = "ready"
    STATUS = "status"
    VOICE_HEARD = "voice.heard"
    VOICE_COMMAND = "voice.command"
    VOICE_REPLY = "voice.reply"
    CAMERA_STATUS = "camera.status"
    CAMERA_CAPTURE_STARTED = "camera.capture.started"
    CAMERA_CAPTURED = "camera.captured"
    AI_STARTED = "ai.started"
    AI_PROGRESS = "ai.progress"
    AI_DONE = "ai.done"
    AI_ERROR = "ai.error"
    PRINT_STARTED = "print.started"
    PRINT_DONE = "print.done"
    ERROR = "error"


class BoothEvent(BaseModel):
    type: BoothEventType
    payload: dict[str, Any] = Field(default_factory=dict)