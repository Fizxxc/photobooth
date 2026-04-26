import cv2
from pathlib import Path

from .base import BaseCamera, CameraStatus


class WebcamCamera(BaseCamera):
    def __init__(self, device_index: int = 0) -> None:
        self.device_index = device_index

    def status(self) -> CameraStatus:
        cap = cv2.VideoCapture(self.device_index)

        if not cap.isOpened():
            return CameraStatus(
                mode="webcam",
                connected=False,
                battery=None,
                model=None,
                message="Webcam tidak terdeteksi.",
            )

        cap.release()

        return CameraStatus(
            mode="webcam",
            connected=True,
            battery=None,
            model=f"OpenCV Camera {self.device_index}",
            message="Webcam ready.",
        )

    def capture(self, output_path: str) -> str:
        cap = cv2.VideoCapture(self.device_index)

        if not cap.isOpened():
            raise RuntimeError("Webcam tidak bisa dibuka.")

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)

        ok, frame = cap.read()
        cap.release()

        if not ok or frame is None:
            raise RuntimeError("Gagal mengambil frame dari webcam.")

        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        cv2.imwrite(str(path), frame)

        return str(path)