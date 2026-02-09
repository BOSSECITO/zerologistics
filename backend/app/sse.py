import asyncio
import json
from typing import Any, Dict, Set

class EventBroadcaster:
    def __init__(self):
        self._clients: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def register(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._clients.add(q)
        return q

    async def unregister(self, q: asyncio.Queue):
        async with self._lock:
            self._clients.discard(q)

    async def publish(self, event: Dict[str, Any]):
        data = json.dumps(event, ensure_ascii=False)
        async with self._lock:
            clients = list(self._clients)

        # no bloqueamos si algún cliente está lento
        for q in clients:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass

broadcaster = EventBroadcaster()
