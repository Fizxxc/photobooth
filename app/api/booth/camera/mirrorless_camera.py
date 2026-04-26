import subprocess
from pathlib import Path

from .base import BaseCamera, CameraStatus


class MirrorlessCamera(BaseCamera):
    """
    Production mode untuk kamera mirrorless via gphoto2.

    Catatan:
    - Sony A6400 support tergantung OS, driver, dan libgphoto2.
    - Untuk Windows, biasanya lebih stabil pakai WSL/Linux booth mini PC.
    - Pastikan kamera USB mode: PC Remote / Mass Storage sesuai setup.
    """

    def __init__(self, gphoto_bin: str = "gphoto2") -> None:
        self.gphoto_bin = gphoto_bin

    def _run(self, args: list[str], timeout: int = 20) -> subprocess.CompletedProcess:
        return subprocess.run(
            [self.gphoto_bin, *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

    def status(self) -> CameraStatus:
        try:
            result = self._run(["--auto-detect"], timeout=8)
            output = result.stdout.strip()

            connected = "usb:" in output.lower() or "ptp" in output.lower()

            return CameraStatus(
                mode="mirrorless",
                connected=connected,
                battery=None,
                model="Sony / gphoto2" if connected else None,
                message="Mirrorless ready." if connected else "Mirrorless belum terdeteksi.",
            )
        except Exception as error:
            return CameraStatus(
                mode="mirrorless",
                connected=False,
                battery=None,
                model=None,
                message=f"Mirrorless error: {error}",
            )

    def capture(self, output_path: str) -> str:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        result = self._run(
            [
                "--capture-image-and-download",
                "--force-overwrite",
                "--filename",
                str(path),
            ],
            timeout=45,
        )

        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Gagal capture mirrorless.")

        if not path.exists():
            raise RuntimeError("Capture mirrorless selesai, tapi file tidak ditemukan.")

        return str(path)