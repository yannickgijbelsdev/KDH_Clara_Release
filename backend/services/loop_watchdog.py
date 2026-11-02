"""Logs the blocking stack trace when the asyncio event loop stalls (the cause of 'white screen' outages)."""
import asyncio
import logging
import sys
import threading
import time
import traceback

logger = logging.getLogger("loop_watchdog")

STALL_SECONDS = 2.0
_last_beat = time.monotonic()
_beat_task = None


async def _heartbeat():
    global _last_beat
    while True:
        _last_beat = time.monotonic()
        await asyncio.sleep(0.5)


def _watch(loop_thread_id: int):
    reported = False
    while True:
        time.sleep(0.5)
        if _beat_task is None or _beat_task.done():
            return  # loop is shutting down (hot reload / stop): no false alarms
        lag = time.monotonic() - _last_beat
        if lag > STALL_SECONDS and not reported:
            frame = sys._current_frames().get(loop_thread_id)
            stack = "".join(traceback.format_stack(frame)[-12:]) if frame else "<no frame>"
            logger.error("Event loop blocked for %.1fs. Blocking code:\n%s", lag, stack)
            reported = True
        elif lag <= STALL_SECONDS:
            reported = False


def start_loop_watchdog():
    global _beat_task
    _beat_task = asyncio.get_running_loop().create_task(_heartbeat())
    threading.Thread(target=_watch, args=(threading.get_ident(),), daemon=True, name="loop-watchdog").start()
