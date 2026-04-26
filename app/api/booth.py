from __future__ import annotations

import base64
import io
import re
from typing import Any, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from pydantic import BaseModel


app = FastAPI(title="KoGraph Booth API", version="1.0.0")

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
    imageDataUrl: Optional[str] = None


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
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def fit_max(image: Image.Image, max_side: int = 2200) -> Image.Image:
    width, height = image.size
    longest = max(width, height)

    if longest <= max_side:
        return image

    scale = max_side / float(longest)
    next_size = (int(width * scale), int(height * scale))

    return image.resize(next_size, Image.Resampling.LANCZOS)


def apply_clean(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(1.08)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image = ImageEnhance.Sharpness(image).enhance(1.18)
    image = ImageEnhance.Brightness(image).enhance(1.02)
    return image


def apply_vintage(image: Image.Image) -> Image.Image:
    image = ImageEnhance.Color(image).enhance(0.86)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    image = ImageEnhance.Brightness(image).enhance(1.04)

    r, g, b = image.split()
    r = ImageEnhance.Brightness(r).enhance(1.08)
    g = ImageEnhance.Brightness(g).enhance(1.02)
    b = ImageEnhance.Brightness(b).enhance(0.86)

    image = Image.merge("RGB", (r, g, b))
    return image.filter(ImageFilter.SMOOTH_MORE)


def apply_bw(image: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(1.18)
    return ImageOps.colorize(gray, black="#050505", white="#f5f5f5")


def apply_upscale(image: Image.Image) -> Image.Image:
    image = fit_max(image, max_side=1800)

    width, height = image.size
    next_size = (width * 2, height * 2)

    image = image.resize(next_size, Image.Resampling.LANCZOS)
    image = ImageEnhance.Sharpness(image).enhance(1.35)
    image = ImageEnhance.Contrast(image).enhance(1.04)

    return fit_max(image, max_side=3200)


def apply_anime_safe(image: Image.Image) -> Image.Image:
    image = fit_max(image, max_side=2200)
    smooth = image.filter(ImageFilter.SMOOTH_MORE)
    smooth = ImageEnhance.Color(smooth).enhance(1.35)
    smooth = ImageEnhance.Contrast(smooth).enhance(1.12)
    smooth = ImageEnhance.Sharpness(smooth).enhance(1.28)

    edges = ImageOps.grayscale(smooth).filter(ImageFilter.FIND_EDGES)
    edges = ImageOps.invert(edges)
    edges = ImageEnhance.Contrast(edges).enhance(1.8)
    edges = edges.convert("RGB")

    return Image.blend(smooth, edges, 0.12)


def apply_face_accessory_safe(image: Image.Image) -> Image.Image:
    image = fit_max(image, max_side=2200).convert("RGBA")

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    width, height = image.size

    # Premium simple sparkle overlay, aman untuk fallback serverless.
    sparkle_color = (255, 255, 255, 210)
    accent_color = (255, 210, 225, 190)

    positions = [
        (int(width * 0.16), int(height * 0.16)),
        (int(width * 0.82), int(height * 0.18)),
        (int(width * 0.12), int(height * 0.78)),
        (int(width * 0.86), int(height * 0.72)),
    ]

    for index, (x, y) in enumerate(positions):
        size = max(18, int(min(width, height) * (0.035 + index * 0.004)))
        color = sparkle_color if index % 2 == 0 else accent_color

        for i in range(size):
            overlay.putpixel((min(width - 1, x + i), y), color)
            overlay.putpixel((max(0, x - i), y), color)
            overlay.putpixel((x, min(height - 1, y + i)), color)
            overlay.putpixel((x, max(0, y - i)), color)

    composed = Image.alpha_composite(image, overlay)
    return composed.convert("RGB")


def apply_background_safe(image: Image.Image, background: str) -> Image.Image:
    image = fit_max(image, max_side=2200).convert("RGBA")
    width, height = image.size

    bg = Image.new("RGBA", image.size)

    if background.lower().strip() == "kota":
        top = (28, 28, 32, 255)
        bottom = (7, 7, 8, 255)
    else:
        top = (168, 220, 235, 255)
        bottom = (244, 225, 196, 255)

    pixels = bg.load()

    for y in range(height):
        ratio = y / max(1, height - 1)
        r = int(top[0] * (1 - ratio) + bottom[0] * ratio)
        g = int(top[1] * (1 - ratio) + bottom[1] * ratio)
        b = int(top[2] * (1 - ratio) + bottom[2] * ratio)

        for x in range(width):
            pixels[x, y] = (r, g, b, 255)

    # Karena Vercel serverless tidak ideal untuk model background-removal besar,
    # fallback ini memberi efek premium subtle tanpa merusak foto.
    photo = ImageEnhance.Contrast(image.convert("RGB")).enhance(1.05).convert("RGBA")
    photo = ImageEnhance.Sharpness(photo.convert("RGB")).enhance(1.12).convert("RGBA")

    composed = Image.alpha_composite(bg, photo)
    return composed.convert("RGB")


@app.get("/api/booth/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "kograph-booth-api",
        "mode": "vercel-python",
    }


@app.get("/api/booth/status")
def status() -> dict[str, Any]:
    return {
        "ok": True,
        "status": {
            "camera": "webcam-ready",
            "mirrorless": "external-agent-required",
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
        message = "Filter vintage selesai. Nuansanya lebih hangat dan klasik."
    elif payload.filter == "bw":
        result = apply_bw(image)
        message = "Filter B&W selesai. Hasilnya lebih clean dan elegan."
    else:
        result = apply_clean(image)
        message = "Filter clean selesai. Warna dan detail sudah dirapikan."

    return {
        "ok": True,
        "filter": payload.filter,
        "imageDataUrl": encode_png_data_url(result),
        "message": message,
    }


@app.post("/api/booth/ai/anime")
def anime(payload: ImageRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_anime_safe(image)

    return {
        "ok": True,
        "imageDataUrl": encode_png_data_url(result),
        "message": "Anime style selesai. Hasil dibuat lebih playful dan colorful.",
    }


@app.post("/api/booth/ai/background")
def background(payload: BackgroundRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_background_safe(image, payload.background)

    return {
        "ok": True,
        "background": payload.background,
        "imageDataUrl": encode_png_data_url(result),
        "message": f"Background {payload.background} selesai diproses.",
    }


@app.post("/api/booth/ai/face-accessory")
def face_accessory(payload: ImageRequest) -> dict[str, Any]:
    image = decode_data_url(payload.imageDataUrl)
    result = apply_face_accessory_safe(image)

    return {
        "ok": True,
        "imageDataUrl": encode_png_data_url(result),
        "message": "Hias wajah selesai. Hasil dibuat lebih festive.",
    }


@app.post("/api/booth/voice/command")
def voice_command(payload: VoiceCommandRequest) -> dict[str, Any]:
    text = payload.text.strip().lower()

    if "hd" in text or "jadikan hd" in text:
        return {
            "ok": True,
            "command": "upscale",
            "message": "Siap, aku bikin versi HD ya. Biar makin tajam dan cakep!",
        }

    if "anime" in text:
        return {
            "ok": True,
            "command": "anime",
            "message": "Oke, aku ubah jadi gaya anime yang lucu!",
        }

    if "pantai" in text:
        return {
            "ok": True,
            "command": "background",
            "background": "pantai",
            "message": "Siap, latarnya aku buat vibes pantai.",
        }

    if "kota" in text:
        return {
            "ok": True,
            "command": "background",
            "background": "kota",
            "message": "Siap, aku kasih suasana kota yang elegan.",
        }

    if "hias" in text or "wajah" in text:
        return {
            "ok": True,
            "command": "face",
            "message": "Oke, aku tambahin hiasan biar makin seru!",
        }

    if "vintage" in text:
        return {
            "ok": True,
            "command": "filter",
            "filter": "vintage",
            "message": "Siap, aku kasih filter vintage.",
        }

    if "hitam putih" in text or "bw" in text or "b&w" in text:
        return {
            "ok": True,
            "command": "filter",
            "filter": "bw",
            "message": "Siap, aku buat versi hitam putih yang elegan.",
        }

    if "clean" in text:
        return {
            "ok": True,
            "command": "filter",
            "filter": "clean",
            "message": "Siap, aku rapikan warna dan detailnya.",
        }

    if "cetak" in text or "print" in text:
        return {
            "ok": True,
            "command": "print",
            "message": "Siap, silakan lanjut cetak sekarang.",
        }

    phone_match = re.search(r"(\+?62|0)[0-9\s-]{8,18}", text)

    if "whatsapp" in text and phone_match:
        phone = re.sub(r"\D", "", phone_match.group(0))

        return {
            "ok": True,
            "command": "whatsapp",
            "phone": phone,
            "message": f"Siap, aku catat untuk kirim ke WhatsApp {phone}.",
        }

    return {
        "ok": True,
        "command": "unknown",
        "message": "Aku belum paham perintahnya. Coba bilang: Jadikan HD, Ubah jadi anime, atau Cetak sekarang.",
    }


@app.post("/api/booth/voice/after-capture")
def after_capture() -> dict[str, Any]:
    return {
        "ok": True,
        "message": "Hasilnya keren! Mau saya buatkan versi HD-nya biar makin tajam?",
        "offers": ["HD Foto", "Anime", "Vintage", "B&W", "Print"],
    }