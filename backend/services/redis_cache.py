"""Redis cache service for Clara — with in-memory fallback when Redis is unavailable."""
import json
import time
import logging

logger = logging.getLogger(__name__)

_redis = None
_redis_checked = False
_redis_available = False
_last_check = 0
_CHECK_COOLDOWN = 300  # Only retry Redis every 5 minutes

# In-memory cache fallback
_mem_cache = {}


async def get_redis():
    global _redis, _redis_checked, _redis_available, _last_check
    now = time.time()

    # If we already know Redis is down, don't retry until cooldown
    if _redis_checked and not _redis_available and (now - _last_check) < _CHECK_COOLDOWN:
        return None

    if _redis is None or (not _redis_available and (now - _last_check) >= _CHECK_COOLDOWN):
        _last_check = now
        try:
            import redis.asyncio as redis_lib
            _redis = redis_lib.Redis(
                host="localhost", port=6379, decode_responses=True,
                socket_connect_timeout=0.3, socket_timeout=0.3,
            )
            await _redis.ping()
            _redis_available = True
            _redis_checked = True
            logger.info("Redis connected")
        except Exception:
            _redis = None
            _redis_available = False
            _redis_checked = True
            return None
    return _redis if _redis_available else None


def _mem_get(key):
    entry = _mem_cache.get(key)
    if entry and entry['exp'] > time.time():
        return entry['val']
    if entry:
        del _mem_cache[key]
    return None


def _mem_set(key, value, ttl):
    # Limit memory cache to 500 entries
    if len(_mem_cache) > 500:
        cutoff = time.time()
        expired = [k for k, v in _mem_cache.items() if v['exp'] <= cutoff]
        for k in expired:
            del _mem_cache[k]
        if len(_mem_cache) > 500:
            _mem_cache.clear()
    _mem_cache[key] = {'val': value, 'exp': time.time() + ttl}


async def cache_get(key: str):
    r = await get_redis()
    if r:
        try:
            val = await r.get(key)
            return json.loads(val) if val else None
        except Exception:
            pass
    return _mem_get(key)


async def cache_set(key: str, value, ttl: int = 60):
    _mem_set(key, value, ttl)
    r = await get_redis()
    if r:
        try:
            await r.setex(key, ttl, json.dumps(value))
        except Exception:
            pass


async def cache_delete(key: str):
    _mem_cache.pop(key, None)
    r = await get_redis()
    if r:
        try:
            await r.delete(key)
        except Exception:
            pass


async def cache_delete_pattern(pattern: str):
    # Clear matching in-memory keys
    import fnmatch
    to_del = [k for k in _mem_cache if fnmatch.fnmatch(k, pattern)]
    for k in to_del:
        del _mem_cache[k]
    r = await get_redis()
    if r:
        try:
            keys = []
            async for key in r.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                await r.delete(*keys)
        except Exception:
            pass
