from typing import Callable

from PIL import ImageEnhance, ImageFilter, ImageOps
from rembg import remove

from .upscale import decode_data_url, encode_data_url


ProgressCallback = Callable[[int, str], None]


def apply_filter(data_url: str, filter_name: str, progress: ProgressCallback | None = None) -> str:
    progress = progress or (lambda percent, message: None)
    name = filter_name.lower().strip()

    progress(10, "Membaca foto...")
    image = decode_data_url(data_url)

    if name in ["clean", "natural"]:
        progress(45, "Menerapkan filter clean...")
        image = ImageEnhance.Color(image).enhance(1.06)
        image = ImageEnhance.Contrast(image).enhance(1.08)
        image = ImageEnhance.Sharpness(image).enhance(1.12)
        image = ImageEnhance.Brightness(image).enhance(1.02)

    elif name in ["vintage"]:
        progress(45, "Menerapkan filter vintage...")
        image = ImageEnhance.Color(image).enhance(0.78)
        image = ImageEnhance.Contrast(image).enhance(0.95)
        image = ImageEnhance.Brightness(image).enhance(1.05)

        r, g, b = image.split()
        r = r.point(lambda value: min(255, int(value * 1.1 + 8)))
        g = g.point(lambda value: min(255, int(value * 1.02 + 3)))
        b = b.point(lambda value: max(0, int(value * 0.88)))
        image = image.merge("RGB", (r, g, b)) if hasattr(image, "merge") else __import__("PIL.Image").Image.merge("RGB", (r, g, b))

    elif name in ["bw", "b&w", "black-white", "hitam-putih"]:
        progress(45, "Menerapkan filter B&W...")
        image = ImageOps.grayscale(image).convert("RGB")
        image = ImageEnhance.Contrast(image).enhance(1.16)

    else:
        raise ValueError(f"Filter tidak dikenal: {filter_name}")

    progress(90, "Finalizing filter...")
    image = image.filter(ImageFilter.UnsharpMask(radius=0.8, percent=80, threshold=3))

    progress(100, "Filter selesai.")
    return encode_data_url(image)


def replace_background(
    data_url: str,
    background: str,
    progress: ProgressCallback | None = None,
) -> str:
    progress = progress or (lambda percent, message: None)

    bg_name = background.lower().strip()
    image = decode_data_url(data_url).convert("RGBA")

    progress(20, "Menghapus background...")
    foreground = remove(image)

    progress(55, "Membuat background baru...")
    width, height = image.size

    if "pantai" in bg_name:
        top = (196, 235, 255, 255)
        bottom = (255, 227, 175, 255)
    elif "kota" in bg_name:
        top = (18, 18, 24, 255)
        bottom = (96, 96, 110, 255)
    elif "putih" in bg_name:
        top = (255, 255, 255, 255)
        bottom = (230, 230, 230, 255)
    else:
        top = (235, 235, 235, 255)
        bottom = (250, 250, 250, 255)

    from PIL import Image, ImageDraw

    bg = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(bg)

    for y in range(height):
        ratio = y / max(1, height - 1)
        color = tuple(int(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(4))
        draw.line([(0, y), (width, y)], fill=color)

    progress(82, "Menggabungkan subject...")
    composed = Image.alpha_composite(bg, foreground)

    progress(100, "Background selesai.")
    return encode_data_url(composed.convert("RGB"))


def anime_style(data_url: str, progress: ProgressCallback | None = None) -> str:
    import cv2
    import numpy as np
    from PIL import Image

    progress = progress or (lambda percent, message: None)

    progress(15, "Membaca foto...")
    image = decode_data_url(data_url)

    progress(45, "Menerapkan stylization...")
    image_np = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    styled = cv2.stylization(image_np, sigma_s=75, sigma_r=0.45)

    progress(78, "Menguatkan warna...")
    rgb = cv2.cvtColor(styled, cv2.COLOR_BGR2RGB)
    output = Image.fromarray(rgb)
    output = ImageEnhance.Color(output).enhance(1.16)
    output = ImageEnhance.Contrast(output).enhance(1.08)

    progress(100, "Anime style selesai.")
    return encode_data_url(output)


def decorate_face(data_url: str, progress: ProgressCallback | None = None) -> str:
    import cv2
    import mediapipe as mp
    import numpy as np
    from PIL import Image, ImageDraw

    progress = progress or (lambda percent, message: None)

    progress(15, "Mendeteksi wajah...")
    image = decode_data_url(data_url).convert("RGB")
    width, height = image.size
    image_np = np.array(image)

    mp_face = mp.solutions.face_detection

    with mp_face.FaceDetection(model_selection=1, min_detection_confidence=0.5) as detector:
        result = detector.process(image_np)

    draw = ImageDraw.Draw(image)

    if not result.detections:
        progress(100, "Tidak ada wajah terdeteksi.")
        return encode_data_url(image)

    progress(55, "Menambahkan aksesoris digital...")

    for detection in result.detections:
        box = detection.location_data.relative_bounding_box
        x = int(box.xmin * width)
        y = int(box.ymin * height)
        w = int(box.width * width)

        heart = max(24, w // 7)
        hx = x + w - heart
        hy = max(0, y - heart // 2)

        draw.ellipse((hx, hy, hx + heart, hy + heart), fill=(255, 90, 130))
        draw.ellipse((hx + heart, hy, hx + heart * 2, hy + heart), fill=(255, 90, 130))
        draw.polygon(
            [
                (hx, hy + heart // 2),
                (hx + heart * 2, hy + heart // 2),
                (hx + heart, hy + heart * 2),
            ],
            fill=(255, 90, 130),
        )

    progress(100, "Hias wajah selesai.")
    return encode_data_url(image)