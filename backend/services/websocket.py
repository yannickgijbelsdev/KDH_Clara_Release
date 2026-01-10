"""WebSocket connection manager for real-time collaboration."""
from fastapi import WebSocket
from typing import Dict
import asyncio


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""
    
    def __init__(self):
        self.active_connections: Dict[str, Dict[WebSocket, dict]] = {}
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, rundown_id: str, user_info: dict):
        await websocket.accept()
        async with self.lock:
            if rundown_id not in self.active_connections:
                self.active_connections[rundown_id] = {}
            self.active_connections[rundown_id][websocket] = user_info
        await self.broadcast_presence(rundown_id)
    
    async def disconnect(self, websocket: WebSocket, rundown_id: str):
        async with self.lock:
            if rundown_id in self.active_connections:
                self.active_connections[rundown_id].pop(websocket, None)
                if not self.active_connections[rundown_id]:
                    del self.active_connections[rundown_id]
        await self.broadcast_presence(rundown_id)
    
    async def broadcast(self, rundown_id: str, message: dict, exclude: WebSocket = None):
        """Broadcast message to all connections in a rundown room."""
        if rundown_id not in self.active_connections:
            return
        
        disconnected = []
        for websocket in self.active_connections[rundown_id].keys():
            if websocket != exclude:
                try:
                    await websocket.send_json(message)
                except Exception:
                    disconnected.append(websocket)
        
        for ws in disconnected:
            async with self.lock:
                self.active_connections[rundown_id].pop(ws, None)
    
    async def broadcast_presence(self, rundown_id: str):
        """Broadcast current presence list to all connections."""
        if rundown_id not in self.active_connections:
            return
        
        users = []
        for user_info in self.active_connections[rundown_id].values():
            users.append({
                "id": user_info.get("id"),
                "name": user_info.get("name", "Unknown"),
                "avatar_url": user_info.get("avatar_url"),
                "initials": self.get_initials(user_info.get("name", "U"))
            })
        
        seen_ids = set()
        unique_users = []
        for u in users:
            if u["id"] not in seen_ids:
                seen_ids.add(u["id"])
                unique_users.append(u)
        
        message = {
            "type": "presence",
            "users": unique_users
        }
        await self.broadcast(rundown_id, message)
    
    def get_initials(self, name: str) -> str:
        if not name:
            return "?"
        parts = name.split()
        if len(parts) >= 2:
            return (parts[0][0] + parts[-1][0]).upper()
        return name[0].upper()
    
    def get_presence(self, rundown_id: str) -> list:
        """Get current users viewing a rundown."""
        if rundown_id not in self.active_connections:
            return []
        
        users = []
        seen_ids = set()
        for user_info in self.active_connections[rundown_id].values():
            if user_info.get("id") not in seen_ids:
                seen_ids.add(user_info.get("id"))
                users.append({
                    "id": user_info.get("id"),
                    "name": user_info.get("name", "Unknown"),
                    "avatar_url": user_info.get("avatar_url"),
                    "initials": self.get_initials(user_info.get("name", "U"))
                })
        return users


# Global connection manager instance
ws_manager = ConnectionManager()
