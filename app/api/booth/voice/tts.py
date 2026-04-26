import threading
import queue
import pyttsx3


class TTSWorker:
    def __init__(self) -> None:
        self._queue: queue.Queue[str] = queue.Queue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._started = False

    def start(self) -> None:
        if self._started:
            return

        self._started = True
        self._thread.start()

    def say(self, text: str) -> None:
        if not text:
            return

        self._queue.put(text)

    def _run(self) -> None:
        engine = pyttsx3.init()
        engine.setProperty("rate", 178)
        engine.setProperty("volume", 1.0)

        while True:
            text = self._queue.get()

            try:
                engine.say(text)
                engine.runAndWait()
            except Exception:
                pass


tts_worker = TTSWorker()