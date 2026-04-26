import base64
import io
from pathlib import Path
from typing import Callable

from PIL import Image, ImageEnhance, ImageFilter


ProgressCallback = Callable[[int, str], None]


def image_to_data_url(path: str) -> str:
    image_path = Path(path)

    if not image_path.exists():
        raise FileNotFoundError(path)

    encoded = base64.b64encode(image_path.read_bytes()).decode("utf-8")

    return f"data:image/png;base64,{encoded}"


def decode_data_url(data_url: str) -> Image.Image:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]

    raw = base64.b64decode(data_url)

    return Image.open(io.BytesIO(raw)).convert("RGB")


def encode_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return f"data:image/png;base64,{encoded}"


def upscale_with_realesrgan(data_url: str, progress: ProgressCallback | None = None) -> str:
    """
    Production HD upscale.
    Akan memakai Real-ESRGAN jika dependency tersedia.
    Kalau dependency belum tersedia, function akan error jelas agar operator tahu setup belum lengkap.
    """

    try:
        import numpy as np
        import torch
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer
    except Exception as error:
        raise RuntimeError(
            "Real-ESRGAN belum terinstall. Jalankan: pip install torch torchvision realesrgan gfpgan basicsr"
        ) from error

    progress = progress or (lambda percent, message: None)

    progress(5, "Membaca gambar...")
    image = decode_data_url(data_url)
    image_np = np.array(image)

    progress(18, "Menyiapkan model Real-ESRGAN...")
    device = "cuda" if torch.cuda.is_available() else "cpu"

    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=4,
    )

    model_path = Path("models/RealESRGAN_x4plus.pth")

    if not model_path.exists():
        raise RuntimeError(
            "Model RealESRGAN_x4plus.pth tidak ditemukan. Simpan di: models/RealESRGAN_x4plus.pth"
        )

    upsampler = RealESRGANer(
        scale=4,
        model_path=str(model_path),
        model=model,
        tile=256,
        tile_pad=10,
        pre_pad=0,
        half=device == "cuda",
        device=torch.device(device),
    )

    progress(42, "Memproses HD upscale...")
    output, _ = upsampler.enhance(image_np, outscale=2)

    progress(82, "Menajamkan hasil...")
    final = Image.fromarray(output)
    final = ImageEnhance.Sharpness(final).enhance(1.08)
    final = final.filter(ImageFilter.UnsharpMask(radius=1.1, percent=90, threshold=3))

    progress(100, "Foto HD selesai.")

    return encode_data_url(final)


def upscale_light_production(data_url: str, progress: ProgressCallback | None = None) -> str:
    """
    Fallback production-safe kalau Real-ESRGAN belum diaktifkan.
    Tetap real image processing, bukan mock.
    """

    progress = progress or (lambda percent, message: None)

    progress(10, "Membaca gambar...")
    image = decode_data_url(data_url)

    progress(35, "Upscale high-quality...")
    width, height = image.size
    image = image.resize((width * 2, height * 2), Image.Resampling.LANCZOS)

    progress(65, "Enhancing detail...")
    image = ImageEnhance.Sharpness(image).enhance(1.35)
    image = ImageEnhance.Contrast(image).enhance(1.06)
    image = ImageEnhance.Color(image).enhance(1.03)

    progress(88, "Final sharpening...")
    image = image.filter(ImageFilter.UnsharpMask(radius=1.25, percent=130, threshold=3))

    progress(100, "Foto HD selesai.")

    return encode_data_url(image)