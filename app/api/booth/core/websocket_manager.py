import asyncio
import json
from typing import Set

from fastapi import WebSocket
from .events import BoothEvent, BoothEventType


class WebSocketManager:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()

        async with self._lock:
            self._clients.add(websocket)

        await self.send_to(
            websocket,
            BoothEvent(
                type=BoothEventType.READY,
                payload={
                    "message": "KoGraph Booth Agent connected.",
                    "realtime": True,
                },
            ),
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def send_to(self, websocket: WebSocket, event: BoothEvent) -> None:
        await websocket.send_text(event.model_dump_json())

    async def broadcast(self, event: BoothEvent) -> None:
        async with self._lock:
            clients = list(self._clients)

        dead_clients: list[WebSocket] = []

        for client in clients:
            try:
                await client.send_text(event.model_dump_json())
            except Exception:
                dead_clients.append(client)

        if dead_clients:
            async with self._lock:
                for client in dead_clients:
                    self._clients.discard(client)

    async def broadcast_raw(self, event_type: BoothEventType, payload: dict) -> None:
        await self.broadcast(BoothEvent(type=event_type, payload=payload))


ws_manager = WebSocketManager()