import re


def parse_voice_command(text: str) -> dict:
    raw = str(text or "").strip()
    value = raw.lower()

    if not value:
        return {
            "command": "unknown",
            "message": "Aku belum dengar perintahnya. Coba ulangi pelan-pelan ya.",
        }

    if "jadikan hd" in value or "buat hd" in value or "hd foto" in value:
        return {
            "command": "upscale",
            "message": "Siap, aku bikin versi HD. Jangan gerak dulu ya, biar hasilnya tajam.",
        }

    if "ganti latar belakang" in value:
        match = re.search(r"ganti latar belakang\s+(.+)", value)
        background = match.group(1).strip() if match else "pantai"

        return {
            "command": "background",
            "background": background,
            "message": f"Oke, aku ganti latarnya ke {background}.",
        }

    if "ubah jadi anime" in value or "jadi anime" in value:
        return {
            "command": "anime",
            "message": "Siap, aku ubah jadi gaya anime. Ini bakal lucu banget.",
        }

    if "hias wajah" in value:
        return {
            "command": "face_accessory",
            "message": "Oke, aku hias wajahnya. Siap-siap makin gemas.",
        }

    if "vintage" in value:
        return {
            "command": "filter",
            "filter": "vintage",
            "message": "Filter vintage aku pasang. Vibes-nya manis banget.",
        }

    if "clean" in value or "natural" in value:
        return {
            "command": "filter",
            "filter": "clean",
            "message": "Aku rapikan pakai filter clean.",
        }

    if "hitam putih" in value or "black white" in value or "b&w" in value:
        return {
            "command": "filter",
            "filter": "bw",
            "message": "Aku buat hitam putih yang elegan.",
        }

    if "cetak sekarang" in value or "print sekarang" in value:
        return {
            "command": "print_now",
            "message": "Siap, aku mulai proses cetak.",
        }

    wa_match = re.search(r"kirim ke whatsapp nomor\s+([0-9+ ]+)", value)
    if wa_match:
        phone = wa_match.group(1).replace(" ", "")

        return {
            "command": "delivery_whatsapp",
            "phone": phone,
            "message": f"Oke, aku siapkan pengiriman ke WhatsApp {phone}.",
        }

    return {
        "command": "unknown",
        "message": "Aku belum paham perintahnya. Tapi tenang, fotonya tetap kece.",
    }


def after_capture_response() -> str:
    return "Hasilnya keren! Mau aku buatkan versi HD, ganti background, atau langsung cetak?"