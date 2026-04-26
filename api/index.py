from __future__ import annotations

import base64
import io
import re
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from pydantic import BaseModel


app = FastAPI(title="KoGraph Booth Python API", version="1.0.0")


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


PhotoFilter = Literal["clean", "vintage", "bw"]


class ImageRequest(BaseModel):
    imageDataUrl: str


class FilterRequest(BaseModel):
    imageDataUrl: str
    filter: PhotoFilter = "clean"


class BackgroundRequest(BaseModel):
    imageDataUrl: str
    background: str = "pantai"


class VoiceCommandRequest(BaseModel):
    text: str


def decode_data_url(image_data_url: str) -> Image.Image:
    if not image_data_url:
        raise HTTPException(status_code=400, detail="imageDataUrl kosong.")

    match = re.match(r"^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$", image_data_url)

    if not match:
        raise HTTPException(status_code=400, detail="Format imageDataUrl tidak valid.")

    try:
        raw = base64.b64decode(match.group(1))
        image = Image.open(io.BytesIO(raw))
        return image.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Gagal membaca imageDataUrl.") from exc


def encode_png_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def limit_image_size(image: Image.Image, max_side: int = 1800) -> Image.Image:
    width, height = image.size
    longest = max(width, height)

    if longest <= max_side:
        return image

    scale = max_side / longest
    next_size = (int(width * scale), int(height * scale))
    return image.resize(next_size, Image.Resampling.LANCZOS)


def apply_clean(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(1.08)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image = ImageEnhance.Sharpness(image).enhance(1.2)
    image = ImageEnhance.Brightness(image).enhance(1.02)
    return image


def apply_vintage(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(0.82)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    image = ImageEnhance.Brightness(image).enhance(1.04)

    r, g, b = image.split()
    r = ImageEnhance.Brightness(r).enhance(1.12)
    g = ImageEnhance.Brightness(g).enhance(1.03)
    b = ImageEnhance.Brightness(b).enhance(0.82)

    return Image.merge("RGB", (r, g, b)).filter(ImageFilter.SMOOTH_MORE)


def apply_bw(image: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(1.2)
    return ImageOps.colorize(gray, black="#050505", white="#f7f7f7")


def apply_upscale(image: Image.Image) -> Image.Image:
    image = limit_image_size(image, max_side=1600)
    width, height = image.size

    image = image.resize((width * 2, height * 2), Image.Resampling.LANCZOS)
    image = ImageEnhance.Sharpness(image).enhance(1.4)
    image = ImageEnhance.Contrast(image).enhance(1.05)

    return limit_image_size(image, max_side=3200)


def apply_anime(image: Image.Image) -> Image.Image:
    image = limit_image_size(image, max_side=1800)
    smooth = image.filter(ImageFilter.SMOOTH_MORE)
    smooth = ImageEnhance.Color(smooth).enhance(1.35)
    smooth = ImageEnhance.Contrast(smooth).enhance(1.14)
    smooth = ImageEnhance.Sharpness(smooth).enhance(1.25)

    edges = ImageOps.grayscale(smooth).filter(ImageFilter.FIND_EDGES)
    edges = ImageOps.invert(edges)
    edges = ImageEnhance.Contrast(edges).enhance(1.8)
    edges = edges.convert("RGB")

    return Image.blend(smooth, edges, 0.12)


def apply_face_decoration(image: Image.Image) -> Image.Image:
    image = limit_image_size(image, max_side=1800).convert("RGBA")
    width, height = image.size

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))

    points = [
        (int(width * 0.13), int(height * 0.16)),
        (int(width * 0.86), int(height * 0.18)),
        (int(width * 0.18), int(height * 0.78)),
        (int(width * 0.82), int(height * 0.72)),
    ]

    for index, (cx, cy) in enumerate(points):
        size = max(16, int(min(width, height) * 0.035))
        color = (255, 255, 255, 210) if index % 2 == 0 else (255, 204, 220, 210)

        for offset in range(size):
            if 0 <= cx + offset < width:
                overlay.putpixel((cx + offset, cy), color)
            if 0 <= cx - offset < width:
                overlay.putpixel((cx - offset, cy), color)
            if 0 <= cy + offset < height:
                overlay.putpixel((cx, cy + offset), color)
            if 0 <= cy - offset < height:
                overlay.putpixel((cx, cy - offset), color)

    result = Image.alpha_composite(image, overlay)
    return result.convert("RGB")


def apply_background(image: Image.Image, background: str) -> Image.Image:
    image = limit_image_size(image, max_side=1800)
    image = apply_clean(image)

    if background.lower().strip() == "kota":
        image = ImageEnhance.Contrast(image).enhance(1.12)
        image = ImageEnhance.Color(image).enhance(0.92)
        return image.filter(ImageFilter.SMOOTH)

    image = ImageEnhance.Brightness(image).enhance(1.06)
    image = ImageEnhance.Color(image).enhance(1.14)
    return image.filter(ImageFilter.SMOOTH)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kograph-booth-python-api",
        "message": "KoGraph Booth Python API is running.",
    }


@app.get("/api/booth/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kograph-booth-python-api",
        "mode": "vercel-python",
    }


@app.get("/api/booth/status")
def status() -> dict[str, Any]:
    return {
        "ok": True,
        "status": {
            "camera": "webcam-ready",
            "mirrorless": "external-local-agent-required",
            "printer": "browser-print-ready",
            "ai": "ready",
            "voice": "command-api-ready",
        },
    }


@app.post("/api/booth/ai/upscale")
def upscale(payload: ImageRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_upscale(image)

    return {
        "ok": True,
        "imageDataUrl": encode_png_data_url(result),
        "message": "HD Foto selesai. Hasil sudah dibuat lebih tajam.",
    }


@app.post("/api/booth/ai/filter")
def photo_filter(payload: FilterRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)

    if payload.filter == "vintage":
        result = apply_vintage(image)
        message = "Filter vintage selesai."
    elif payload.filter == "bw":
        result = apply_bw(image)
        message = "Filter B&W selesai."
    else:
        result = apply_clean(image)
        message = "Filter clean selesai."

    return {
        "ok": True,
        "filter": payload.filter,
        "imageDataUrl": encode_png_data_url(result),
        "message": message,
    }


@app.post("/api/booth/ai/anime")
def anime(payload: ImageRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_anime(image)

    return {
        "ok": True,
        "imageDataUrl": encode_png_data_url(result),
        "message": "Anime style selesai.",
    }


@app.post("/api/booth/ai/background")
def background(payload: BackgroundRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_background(image, payload.background)

    return {
        "ok": True,
        "background": payload.background,
        "imageDataUrl": encode_png_data_url(result),
        "message": f"Background {payload.background} selesai diproses.",
    }


@app.post("/api/booth/ai/face-accessory")
def face_accessory(payload: ImageRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_face_decoration(image)

    return {
        "ok": True,
        "imageDataUrl": encode_png_data_url(result),
        "message": "Hias wajah selesai.",
    }


@app.post("/api/booth/voice/command")
def voice_command(payload: VoiceCommandRequest) -> dict[str, Any]:
    text = payload.text.lower().strip()

    if "hd" in text or "jadikan hd" in text:
        command = "upscale"
        message = "Siap, aku bikin versi HD ya."
    elif "anime" in text:
        command = "anime"
        message = "Oke, aku ubah jadi gaya anime."
    elif "pantai" in text:
        command = "background:pantai"
        message = "Siap, aku kasih vibe pantai."
    elif "kota" in text:
        command = "background:kota"
        message = "Siap, aku kasih suasana kota."
    elif "hias" in text or "wajah" in text:
        command = "face"
        message = "Oke, aku tambahkan hiasan."
    elif "vintage" in text:
        command = "filter:vintage"
        message = "Siap, filter vintage aktif."
    elif "hitam putih" in text or "b&w" in text or "bw" in text:
        command = "filter:bw"
        message = "Siap, aku buat versi hitam putih."
    elif "clean" in text:
        command = "filter:clean"
        message = "Siap, aku rapikan hasilnya."
    elif "cetak" in text or "print" in text:
        command = "print"
        message = "Siap, lanjut cetak sekarang."
    else:
        command = "unknown"
        message = "Aku belum paham. Coba bilang Jadikan HD, Anime, atau Cetak sekarang."

    return {
        "ok": True,
        "command": command,
        "message": message,
    }


@app.post("/api/booth/voice/after-capture")
def after_capture() -> dict[str, Any]:
    return {
        "ok": True,
        "message": "Hasilnya keren! Mau saya buatkan versi HD-nya?",
        "offers": ["HD Foto", "Clean", "Vintage", "B&W", "Anime", "Print"],
    }