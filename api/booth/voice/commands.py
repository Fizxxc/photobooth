from __future__ import annotations

import re
from api.booth.core.events import VoiceCommandResponse


def normalize_command(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def parse_voice_command(raw: str) -> VoiceCommandResponse:
    text = normalize_command(raw)

    if any(key in text for key in ["jadikan hd", "hd foto", "buat hd", "versi hd", "upscale"]):
        return VoiceCommandResponse(
            ok=True,
            intent="hd_upscale",
            action="upscale_hd",
            target=None,
            reply="Siap, saya buatkan versi HD yang lebih tajam. Tahan pose keren kamu sebentar ya!",
            payload={"quality": "hd"},
        )

    bg_match = re.search(r"ganti latar belakang\s+(.+)", text)
    if bg_match:
        target = bg_match.group(1).strip()
        return VoiceCommandResponse(
            ok=True,
            intent="background_replace",
            action="change_background",
            target=target,
            reply=f"Oke, latar belakang saya ganti ke {target}. Biar vibes-nya makin cocok!",
            payload={"background": target},
        )

    if any(key in text for key in ["ubah jadi anime", "anime", "style anime"]):
        return VoiceCommandResponse(
            ok=True,
            intent="anime_style",
            action="style_anime",
            target="anime",
            reply="Mantap, saya siapkan versi anime. Ini bakal kelihatan lucu dan cinematic!",
            payload={"style": "anime"},
        )

    if any(key in text for key in ["hias wajah", "aksesoris", "dekor wajah"]):
        return VoiceCommandResponse(
            ok=True,
            intent="face_decoration",
            action="decorate_face",
            target="face_accessories",
            reply="Siap, wajahnya saya hias tipis-tipis. Tetap elegan, tidak berlebihan.",
            payload={"decorate": True},
        )

    if "vintage" in text:
        return VoiceCommandResponse(ok=True, intent="filter", action="apply_filter", target="vintage", reply="Filter vintage aktif. Nuansanya jadi lebih hangat dan klasik.", payload={"filter": "vintage"})

    if any(key in text for key in ["black and white", "hitam putih", "b&w", "bw"]):
        return VoiceCommandResponse(ok=True, intent="filter", action="apply_filter", target="bw", reply="Filter hitam putih aktif. Clean, timeless, dan classy.", payload={"filter": "bw"})

    if "clean" in text:
        return VoiceCommandResponse(ok=True, intent="filter", action="apply_filter", target="clean", reply="Filter clean aktif. Warna dibuat natural dan rapi.", payload={"filter": "clean"})

    if any(key in text for key in ["cetak sekarang", "print sekarang", "cetak"]):
        return VoiceCommandResponse(ok=True, intent="print", action="print_now", target="printer", reply="Siap, saya kirim ke antrean cetak.", payload={"print": True})

    wa_match = re.search(r"(?:kirim ke whatsapp|kirim whatsapp|whatsapp)\s+([+0-9\s-]+)", text)
    if wa_match:
        number = re.sub(r"[^+0-9]", "", wa_match.group(1))
        return VoiceCommandResponse(ok=True, intent="send_whatsapp", action="send_whatsapp", target=number, reply="Oke, saya siapkan pengiriman ke WhatsApp nomor itu.", payload={"phone": number})

    return VoiceCommandResponse(
        ok=False,
        intent="unknown",
        action="unknown",
        target=None,
        reply="Aku belum menangkap perintahnya. Coba bilang: Jadikan HD, Ubah jadi Anime, atau Cetak Sekarang.",
        payload={},
    )
