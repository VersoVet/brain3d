"""Client Redis pour la souscription aux evenements Onyx."""

import asyncio
import contextlib
import json
import logging
from collections.abc import Callable
from typing import Any

import redis.asyncio as aioredis

from .config import REDIS_CHANNELS, REDIS_URL
from .models import RedisEvent

logger = logging.getLogger(__name__)


class RedisSubscriber:
    """Souscription Redis pour evenements temps reel."""

    def __init__(self, redis_url: str = REDIS_URL, channels: list[str] | None = None):
        self.redis_url = redis_url
        self.channels = channels or list(REDIS_CHANNELS.values())
        self.redis: aioredis.Redis | None = None
        self.pubsub: aioredis.client.PubSub | None = None
        self._running = False
        self._task: asyncio.Task | None = None
        self._callbacks: list[Callable] = []

    async def connect(self) -> bool:
        """Connexion au serveur Redis.

        Returns:
            True if connected, False otherwise.
        """
        try:
            self.redis = await aioredis.from_url(
                self.redis_url, encoding="utf-8", decode_responses=True
            )
            # Test de connexion
            await self.redis.ping()
            logger.info(f"Redis connecte: {self.redis_url}")
            return True
        except Exception as e:
            logger.error(f"Erreur connexion Redis: {e}")
            self.redis = None
            return False

    async def subscribe(self) -> bool:
        """S'abonne aux channels configures.

        Returns:
            True if subscription successful, False otherwise.
        """
        if not self.redis:
            return False

        try:
            self.pubsub = self.redis.pubsub()
            await self.pubsub.subscribe(*self.channels)
            logger.info(f"Abonne aux channels: {self.channels}")
            return True
        except Exception as e:
            logger.error(f"Erreur souscription Redis: {e}")
            return False

    def add_callback(self, callback: Callable[[RedisEvent], Any]) -> None:
        """Ajoute un callback pour les evenements."""
        self._callbacks.append(callback)

    def remove_callback(self, callback: Callable) -> None:
        """Retire un callback."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    async def _process_message(self, message: dict) -> None:
        """Traite un message recu."""
        if message["type"] != "message":
            return

        try:
            data = json.loads(message["data"])
            channel = message.get("channel", "")
            event = RedisEvent(
                type=data.get("type", "unknown"),
                node=data.get("node", "unknown"),
                channel=channel,
                data=data.get("data", {}),
            )

            # Appeler tous les callbacks avec (event, channel)
            for callback in self._callbacks:
                try:
                    if asyncio.iscoroutinefunction(callback):
                        await callback(event, channel)
                    else:
                        callback(event, channel)
                except Exception as e:
                    logger.error(f"Erreur callback Redis: {e}")

        except json.JSONDecodeError as e:
            logger.warning(f"Message Redis invalide: {e}")
        except Exception as e:
            logger.error(f"Erreur traitement message Redis: {e}")

    async def listen(self) -> None:
        """Boucle d'ecoute des messages."""
        if not self.pubsub:
            logger.error("PubSub non initialise")
            return

        self._running = True
        logger.info("Demarrage ecoute Redis...")

        try:
            while self._running:
                try:
                    message = await self.pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if message:
                        await self._process_message(message)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Erreur lecture Redis: {e}")
                    await asyncio.sleep(1)
        finally:
            self._running = False
            logger.info("Arret ecoute Redis")

    async def start(self) -> bool:
        """Demarre le listener en arriere-plan."""
        if self._running:
            return True

        if not await self.connect():
            return False

        if not await self.subscribe():
            return False

        self._task = asyncio.create_task(self.listen())
        return True

    async def stop(self) -> None:
        """Arrete le listener."""
        self._running = False

        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

        if self.pubsub:
            await self.pubsub.unsubscribe(*self.channels)
            await self.pubsub.close()

        if self.redis:
            await self.redis.close()

        logger.info("Redis subscriber arrete")

    async def publish(self, channel: str, message: dict) -> bool:
        """Publie un message sur un channel."""
        if not self.redis:
            return False

        try:
            await self.redis.publish(channel, json.dumps(message))
            return True
        except Exception as e:
            logger.error(f"Erreur publication Redis: {e}")
            return False

    @property
    def is_connected(self) -> bool:
        """Verifie si la connexion est active."""
        return self.redis is not None and self._running


class RedisHealthCheck:
    """Verification sante connexion Redis."""

    def __init__(self, redis_url: str = REDIS_URL):
        self.redis_url = redis_url

    async def check(self) -> dict:
        """Verifie la connexion Redis."""
        try:
            redis = await aioredis.from_url(self.redis_url)
            await redis.ping()

            # Recuperer infos Redis
            info = await redis.info("clients")
            channels = await redis.pubsub_channels("onyx:*")

            await redis.close()

            return {
                "status": "connected",
                "url": self.redis_url,
                "connected_clients": info.get("connected_clients", 0),
                "active_channels": [
                    c.decode() if isinstance(c, bytes) else c for c in channels
                ],
            }
        except Exception as e:
            return {
                "status": "disconnected",
                "url": self.redis_url,
                "error": str(e),
            }
