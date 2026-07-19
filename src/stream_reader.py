"""Lecteur de Redis Streams pour l'historique des evenements."""

import json
import logging
from datetime import datetime
from typing import Any

import redis.asyncio as aioredis

from src.config import REDIS_STREAM, REDIS_URL
from src.models import RedisEvent

logger = logging.getLogger(__name__)


class RedisStreamReader:
    """Lit le stream persistant Redis pour l'historique evenements."""

    def __init__(self, redis_url: str = REDIS_URL, stream_key: str = REDIS_STREAM):
        """Initialize RedisStreamReader.

        Args:
            redis_url: URL de connexion Redis.
            stream_key: Cle du stream Redis.
        """
        self._redis_url = redis_url
        self._stream_key = stream_key
        self._redis: aioredis.Redis | None = None

    async def connect(self) -> bool:
        """Etablit la connexion Redis.

        Returns:
            True si connecte, False sinon.
        """
        try:
            self._redis = await aioredis.from_url(
                self._redis_url, encoding="utf-8", decode_responses=True
            )
            await self._redis.ping()
            logger.info(f"StreamReader connected to {self._redis_url}")
            return True
        except Exception as e:
            logger.error(f"StreamReader connection error: {e}")
            self._redis = None
            return False

    async def read_history(self, count: int = 100) -> list[RedisEvent]:
        """Lit les derniers evenements du stream.

        Args:
            count: Nombre d'evenements a recuperer.

        Returns:
            Liste d'evenements du plus ancien au plus recent.
        """
        if not self._redis:
            return []

        try:
            entries = await self._redis.xrevrange(self._stream_key, count=count)
            events = [self._parse_entry(entry) for entry in reversed(entries)]
            return [e for e in events if e is not None]
        except Exception as e:
            logger.error(f"Error reading stream history: {e}")
            return []

    async def read_since(
        self, last_id: str = "0-0", count: int = 50
    ) -> list[RedisEvent]:
        """Lit les evenements depuis un ID donne.

        Args:
            last_id: ID du dernier evenement recu par le client.
            count: Nombre max d'evenements a retourner.

        Returns:
            Liste d'evenements posterieurs a last_id.
        """
        if not self._redis:
            return []

        try:
            result = await self._redis.xread({self._stream_key: last_id}, count=count)
            if not result:
                return []

            events = []
            for _stream_name, entries in result:
                for entry in entries:
                    parsed = self._parse_entry(entry)
                    if parsed:
                        events.append(parsed)
            return events
        except Exception as e:
            logger.error(f"Error reading stream since {last_id}: {e}")
            return []

    async def get_stream_info(self) -> dict[str, Any]:
        """Retourne les informations sur le stream.

        Returns:
            Dict avec length, first_entry, last_entry, etc.
        """
        if not self._redis:
            return {"status": "disconnected"}

        try:
            info = await self._redis.xinfo_stream(self._stream_key)
            return {
                "status": "connected",
                "length": info.get("length", 0),
                "first_entry": info.get("first-entry"),
                "last_entry": info.get("last-entry"),
                "stream_key": self._stream_key,
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _parse_entry(self, entry: tuple[str, dict[str, str]]) -> RedisEvent | None:
        """Parse une entree du stream en RedisEvent.

        Args:
            entry: Tuple (id, fields) du stream Redis.

        Returns:
            RedisEvent ou None si parsing echoue.
        """
        try:
            _entry_id, fields = entry
            # Le stream peut stocker les donnees dans un champ "data" JSON
            raw_data = fields.get("data", "{}")
            data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data

            return RedisEvent(
                type=data.get("type", fields.get("type", "unknown")),
                node=data.get("node", fields.get("node", "unknown")),
                channel=self._stream_key,
                timestamp=datetime.fromisoformat(
                    data.get("timestamp", datetime.now().isoformat())
                ),
                data=data.get("data", data),
            )
        except Exception as e:
            logger.debug(f"Failed to parse stream entry: {e}")
            return None

    async def close(self) -> None:
        """Ferme la connexion Redis."""
        if self._redis:
            await self._redis.close()
            self._redis = None
