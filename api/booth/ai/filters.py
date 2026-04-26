from __future__ import annotations

from io import BytesIO
from PIL import Image, ImageEnhance, ImageOps, ImageFilter


def load_image(data: bytes) -> Image.Image:
    return Image.open(BytesIO(data)).convert("RGB")


def export_png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def apply_filter_bytes(data: bytes, filter_name: str) -> bytes:
    image = load_image(data)
    name = filter_name.lower().strip()

    if name == "bw":
        result = ImageOps.grayscale(image).convert("RGB")
    elif name == "vintage":
        result = ImageEnhance.Color(image).enhance(0.78)
        result = ImageEnhance.Contrast(result).enhance(1.08)
        overlay = Image.new("RGB", result.size, (255, 236, 198))
        result = Image.blend(result, overlay, 0.12)
    elif name == "clean":
        result = ImageEnhance.Color(image).enhance(1.06)
        result = ImageEnhance.Contrast(result).enhance(1.04)
        result = ImageEnhance.Sharpness(result).enhance(1.12)
    else:
        result = image

    return export_png(result)


def lightweight_hd_bytes(data: bytes, scale: int = 2) -> bytes:
    image = load_image(data)
    width, height = image.size
    result = image.resize((width * scale, height * scale), Image.Resampling.LANCZOS)
    result = ImageEnhance.Sharpness(result).enhance(1.28)
    result = result.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=3))
    return export_png(result)
