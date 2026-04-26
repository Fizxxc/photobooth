import asyncio
from typing import Any, Awaitable, Callable


CommandHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class CommandBus:
    def __init__(self) -> None:
        self._handlers: dict[str, CommandHandler] = {}

    def register(self, command: str, handler: CommandHandler) -> None:
        self._handlers[command] = handler

    async def execute(self, command: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        handler = self._handlers.get(command)

        if not handler:
            raise ValueError(f"Unknown command: {command}")

        return await handler(payload or {})


command_bus = CommandBus()