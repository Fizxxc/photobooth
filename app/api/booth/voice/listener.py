import threading
import time
from typing import Callable

import speech_recognition as sr


VoiceCallback = Callable[[str], None]


class VoiceListener:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._running = False
        self._callback: VoiceCallback | None = None

    def start(self, callback: VoiceCallback) -> None:
        if self._running:
            return

        self._callback = callback
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False

    def _loop(self) -> None:
        recognizer = sr.Recognizer()
        recognizer.dynamic_energy_threshold = True
        recognizer.pause_threshold = 0.8

        try:
            microphone = sr.Microphone()
        except Exception:
            return

        with microphone as source:
            recognizer.adjust_for_ambient_noise(source, duration=1)

        while self._running:
            try:
                with microphone as source:
                    audio = recognizer.listen(source, timeout=1.5, phrase_time_limit=5)

                text = recognizer.recognize_google(audio, language="id-ID")

                if self._callback:
                    self._callback(text)

            except sr.WaitTimeoutError:
                continue
            except sr.UnknownValueError:
                continue
            except Exception:
                time.sleep(1)


voice_listener = VoiceListener()