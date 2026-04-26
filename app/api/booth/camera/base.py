from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class CameraStatus:
    mode: str
    connected: bool
    battery: Optional[int]
    model: Optional[str]
    message: str


class BaseCamera(ABC):
    @abstractmethod
    def status(self) -> CameraStatus:
        pass

    @abstractmethod
    def capture(self, output_path: str) -> str:
        pass