import asyncio
import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .ai.upscale import upscale_light_production, upscale_with_realesrgan
from .ai.filters import apply_filter, replace_background, anime_style, decorate_face
from .camera.webcam_camera import WebcamCamera
from .camera.mirrorless_camera import MirrorlessCamera
from .core.events import BoothEvent, BoothEventType
from .core.websocket_manager import ws_manager
from .voice.commands import parse_voice_command, after_capture_response
from .voice.listener import voice_listener
from .voice.speaker import speak
from .voice.tts import tts_worker


app = FastAPI(title="KoGraph Studio Booth Agent", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kographbooth.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImagePayload(BaseModel):
    imageDataUrl: str
    mode: str | None = "production"


class FilterPayload(BaseModel):
    imageDataUrl: str
    filter: str = "clean"


class BackgroundPayload(BaseModel):
    imageDataUrl: str
    background: str = "pantai"


class CommandPayload(BaseModel):
    text: str
    imageDataUrl: str | None = None


class CapturePayload(BaseModel):
    cameraMode: str = "webcam"


def emit_threadsafe(event_type: BoothEventType, payload: dict[str, Any]) -> None:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast(BoothEvent(type=event_type, payload=payload)),
                loop,
            )
    except RuntimeError:
        pass


async def emit(event_type: BoothEventType, payload: dict[str, Any]) -> None:
    await ws_manager.broadcast(BoothEvent(type=event_type, payload=payload))


def make_progress_callback(job: str):
    def progress(percent: int, message: str) -> None:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    ws_manager.broadcast(
                        BoothEvent(
                            type=BoothEventType.AI_PROGRESS,
                            payload={
                                "job": job,
                                "percent": max(0, min(100, percent)),
                                "message": message,
                            },
                        )
                    ),
                    loop,
                )
        except RuntimeError:
            pass

    return progress


async def run_ai_job(job: str, fn, *args):
    await emit(
        BoothEventType.AI_STARTED,
        {
            "job": job,
            "percent": 0,
            "message": "AI processing dimulai.",
        },
    )

    progress = make_progress_callback(job)

    try:
        result = await asyncio.to_thread(fn, *args, progress)

        await emit(
            BoothEventType.AI_DONE,
            {
                "job": job,
                "percent": 100,
                "imageDataUrl": result,
                "message": "AI processing selesai.",
            },
        )

        return result

    except Exception as error:
        await emit(
            BoothEventType.AI_ERROR,
            {
                "job": job,
                "message": str(error),
            },
        )
        raise


@app.on_event("startup")
async def startup() -> None:
    tts_worker.start()

    def on_voice(text: str) -> None:
        parsed = parse_voice_command(text)

        try:
            asyncio.run(
                ws_manager.broadcast(
                    BoothEvent(
                        type=BoothEventType.VOICE_HEARD,
                        payload={
                            "text": text,
                            "parsed": parsed,
                        },
                    )
                )
            )
        except Exception:
            pass

        if parsed.get("message"):
            speak(parsed["message"])

    voice_listener.start(on_voice)


@app.get("/api/booth/health")
async def health():
    return {
        "ok": True,
        "service": "kograph-booth-agent",
        "version": "2.0.0",
        "realtime": True,
    }


@app.get("/api/booth/status")
async def status():
    webcam = WebcamCamera().status()
    mirrorless = MirrorlessCamera().status()

    payload = {
        "camera": {
            "webcam": webcam.__dict__,
            "mirrorless": mirrorless.__dict__,
        },
        "ai": {
            "enabled": True,
            "realesrgan": Path("models/RealESRGAN_x4plus.pth").exists(),
        },
        "voice": {
            "enabled": True,
            "language": "id-ID",
        },
        "printer": {
            "connected": False,
            "queue": 0,
        },
        "realtime": {
            "websocket": True,
        },
    }

    await emit(BoothEventType.STATUS, payload)

    return {
        "ok": True,
        "status": payload,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)

    try:
        while True:
            raw = await websocket.receive_json()
            command = raw.get("command")
            payload = raw.get("payload") or {}

            if command == "ping":
                await ws_manager.send_to(
                    websocket,
                    BoothEvent(
                        type=BoothEventType.STATUS,
                        payload={
                            "pong": True,
                            "timestamp": time.time(),
                        },
                    ),
                )

            elif command == "speak":
                text = str(payload.get("text", ""))
                speak(text)
                await emit(
                    BoothEventType.VOICE_REPLY,
                    {
                        "message": text,
                    },
                )

    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)


@app.post("/api/booth/capture")
async def capture(payload: CapturePayload):
    await emit(
        BoothEventType.CAMERA_CAPTURE_STARTED,
        {
            "cameraMode": payload.cameraMode,
        },
    )

    output_dir = Path(tempfile.gettempdir()) / "kograph-booth-captures"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"capture-{int(time.time() * 1000)}.jpg"

    camera = MirrorlessCamera() if payload.cameraMode == "mirrorless" else WebcamCamera()

    try:
        path = await asyncio.to_thread(camera.capture, str(output_path))

        encoded = base64.b64encode(Path(path).read_bytes()).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{encoded}"

        await emit(
            BoothEventType.CAMERA_CAPTURED,
            {
                "cameraMode": payload.cameraMode,
                "path": path,
                "imageDataUrl": data_url,
            },
        )

        return {
            "ok": True,
            "path": path,
            "imageDataUrl": data_url,
        }

    except Exception as error:
        await emit(
            BoothEventType.ERROR,
            {
                "scope": "camera.capture",
                "message": str(error),
            },
        )
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/api/booth/upscale")
async def upscale(payload: ImagePayload):
    use_realesrgan = os.getenv("KOGRAPH_USE_REALESRGAN", "0") == "1"

    fn = upscale_with_realesrgan if use_realesrgan else upscale_light_production
    result = await run_ai_job("upscale", fn, payload.imageDataUrl)

    return {
        "ok": True,
        "imageDataUrl": result,
        "message": "Foto HD selesai.",
    }


@app.post("/api/booth/filter")
async def filter_photo(payload: FilterPayload):
    result = await run_ai_job("filter", apply_filter, payload.imageDataUrl, payload.filter)

    return {
        "ok": True,
        "imageDataUrl": result,
        "filter": payload.filter,
        "message": "Filter selesai.",
    }


@app.post("/api/booth/background")
async def background(payload: BackgroundPayload):
    result = await run_ai_job(
        "background",
        replace_background,
        payload.imageDataUrl,
        payload.background,
    )

    return {
        "ok": True,
        "imageDataUrl": result,
        "background": payload.background,
        "message": "Background selesai.",
    }


@app.post("/api/booth/anime")
async def anime(payload: ImagePayload):
    result = await run_ai_job("anime", anime_style, payload.imageDataUrl)

    return {
        "ok": True,
        "imageDataUrl": result,
        "message": "Anime style selesai.",
    }


@app.post("/api/booth/face-accessory")
async def face_accessory(payload: ImagePayload):
    result = await run_ai_job("face-accessory", decorate_face, payload.imageDataUrl)

    return {
        "ok": True,
        "imageDataUrl": result,
        "message": "Hias wajah selesai.",
    }


@app.post("/api/booth/command")
async def command(payload: CommandPayload):
    parsed = parse_voice_command(payload.text)

    await emit(
        BoothEventType.VOICE_COMMAND,
        {
            "text": payload.text,
            "parsed": parsed,
        },
    )

    if parsed.get("message"):
        speak(parsed["message"])

    return {
        "ok": True,
        **parsed,
    }


@app.post("/api/booth/after-capture")
async def after_capture():
    message = after_capture_response()

    speak(message)

    await emit(
        BoothEventType.VOICE_REPLY,
        {
            "message": message,
        },
    )

    return {
        "ok": True,
        "message": message,
        "offers": ["upscale", "background", "anime", "filter", "print"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.booth.main:app",
        host="127.0.0.1",
        port=8765,
        reload=True,
    )