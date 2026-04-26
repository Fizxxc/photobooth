from __future__ import annotations

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from api.booth.ai.filters import apply_filter_bytes, lightweight_hd_bytes
from api.booth.ai.upscale import progress_stream
from api.booth.core.events import BoothStatus, VoiceCommandRequest
from api.booth.voice.commands import parse_voice_command

app = FastAPI(title="KoGraph Studio Booth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kographbooth.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"ok": True, "service": "KoGraph Studio Booth Python API"}


@app.get("/api/booth/health")
def health():
    return {"ok": True, "runtime": "vercel-python", "message": "healthy"}


@app.get("/api/booth/status", response_model=BoothStatus)
def status():
    return BoothStatus()


@app.post("/api/booth/voice/command")
async def voice_command(payload: VoiceCommandRequest):
    return parse_voice_command(payload.command)


@app.get("/api/booth/ai/upscale-stream")
async def upscale_stream(job_id: str | None = None):
    return StreamingResponse(
        progress_stream(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/booth/ai/filter")
async def filter_image(file: UploadFile = File(...), filter_name: str = Form("clean")):
    data = await file.read()
    result = apply_filter_bytes(data, filter_name)
    return Response(content=result, media_type="image/png")


@app.post("/api/booth/ai/upscale")
async def upscale_image(file: UploadFile = File(...), scale: int = Form(2)):
    data = await file.read()
    safe_scale = 2 if scale not in [2, 3] else scale
    result = lightweight_hd_bytes(data, safe_scale)
    return Response(content=result, media_type="image/png")
