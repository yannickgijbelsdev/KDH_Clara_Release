"""WebRTC Signaling Service — manages call rooms and WebSocket connections for peer-to-peer audio."""
import logging
import time
from fastapi import WebSocket

logger = logging.getLogger("call.signaling")


class CallSignalingManager:
    """Manages WebSocket connections for WebRTC call signaling."""

    def __init__(self):
        # room_id -> {"host": WebSocket, "caller": WebSocket}
        self.rooms = {}
        # room_id -> {role -> connection_info}
        self.room_info = {}

    async def connect(self, room_id: str, role: str, websocket: WebSocket):
        """Connect a participant to a call room."""
        await websocket.accept()

        if room_id not in self.rooms:
            self.rooms[room_id] = {}
            self.room_info[room_id] = {}

        self.rooms[room_id][role] = websocket
        self.room_info[room_id][role] = {"connected_at": time.time()}

        # Notify the other party that someone joined
        other_role = "caller" if role == "host" else "host"
        if other_role in self.rooms.get(room_id, {}):
            try:
                await self.rooms[room_id][other_role].send_json({
                    "type": "peer_joined",
                    "role": role,
                })
            except Exception:
                pass

        logger.info(f"Call room {room_id}: {role} connected")

    async def disconnect(self, room_id: str, role: str):
        """Disconnect a participant from a call room."""
        if room_id in self.rooms:
            self.rooms[room_id].pop(role, None)
            self.room_info.get(room_id, {}).pop(role, None)

            # Notify the other party
            other_role = "caller" if role == "host" else "host"
            if other_role in self.rooms.get(room_id, {}):
                try:
                    await self.rooms[room_id][other_role].send_json({
                        "type": "peer_left",
                        "role": role,
                    })
                except Exception:
                    pass

            # Clean up empty rooms
            if not self.rooms[room_id]:
                del self.rooms[room_id]
                self.room_info.pop(room_id, None)

        logger.info(f"Call room {room_id}: {role} disconnected")

    async def relay_message(self, room_id: str, from_role: str, message: dict):
        """Relay a signaling message (offer/answer/ICE candidate) to the other party."""
        other_role = "caller" if from_role == "host" else "host"
        target_ws = self.rooms.get(room_id, {}).get(other_role)

        if target_ws:
            try:
                await target_ws.send_json({
                    **message,
                    "from": from_role,
                })
            except Exception as e:
                logger.error(f"Failed to relay message in room {room_id}: {e}")

    def get_room_status(self, room_id: str) -> dict:
        """Get the current status of a call room."""
        room = self.rooms.get(room_id, {})
        return {
            "room_id": room_id,
            "host_connected": "host" in room,
            "caller_connected": "caller" in room,
            "participants": len(room),
        }


# Global instance
call_signaling = CallSignalingManager()
