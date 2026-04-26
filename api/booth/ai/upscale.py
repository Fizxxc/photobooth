from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def progress_stream(job_id: str | None = None) -> AsyncIterator[str]:
    yield sse("start", {"jobId": job_id, "progress": 0, "message": "Menyiapkan mesin HD."})

    steps = [
        (8, "Membaca photostrip."),
        (18, "Membersihkan noise ringan."),
        (31, "Mengunci detail wajah."),
        (45, "Meningkatkan ketajaman."),
        (63, "Menghaluskan warna."),
        (78, "Menyusun hasil HD."),
        (92, "Final touch."),
        (100, "Versi HD siap."),
    ]

    for progress, message in steps:
        await asyncio.sleep(0.35)
        yield sse("progress", {"jobId": job_id, "progress": progress, "message": message})

    yield sse("done", {"jobId": job_id, "progress": 100, "message": "Hasilnya keren! Mau saya bantu cetak atau kirim?"})
