"""Audio Trigger Service - Detects audio fingerprints in live streams."""
import asyncio
import logging
import uuid
import os
import tempfile
import shutil
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Tuple
import httpx
import numpy as np

logger = logging.getLogger(__name__)

# Try to import audio processing libraries
try:
    import librosa
    import soundfile as sf
    AUDIO_LIBS_AVAILABLE = True
except ImportError:
    AUDIO_LIBS_AVAILABLE = False
    logger.warning("Audio libraries not available. Install librosa and soundfile.")


def is_ffmpeg_available() -> bool:
    """Check if ffmpeg is installed and accessible."""
    return shutil.which("ffmpeg") is not None


# Cache ffmpeg availability at module load
FFMPEG_AVAILABLE = is_ffmpeg_available()

# Stream configurations
STREAM_URLS = {
    "mfy": "http://mfy.level27.be/stream",
    "grk": "http://grk.level27.be/stream",
}

# Audio analysis settings
SAMPLE_RATE = 22050  # Standard for audio fingerprinting
CHUNK_DURATION = 8   # Seconds of audio to analyze at once (increased for better detection)
HOP_LENGTH = 512     # For MFCC calculation
N_MFCC = 20          # Number of MFCC coefficients
DEFAULT_THRESHOLD = 0.75  # Lowered from 0.85 for better detection of short jingles


def compute_audio_fingerprint(audio_data: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Compute audio fingerprint using MFCC (Mel-frequency cepstral coefficients).
    
    Returns a compact representation of the audio that can be compared.
    """
    if not AUDIO_LIBS_AVAILABLE:
        raise RuntimeError("Audio libraries not available")
    
    # Ensure mono audio
    if len(audio_data.shape) > 1:
        audio_data = librosa.to_mono(audio_data)
    
    # Resample if needed
    if sr != SAMPLE_RATE:
        audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=SAMPLE_RATE)
        sr = SAMPLE_RATE
    
    # Compute MFCCs
    mfccs = librosa.feature.mfcc(
        y=audio_data, 
        sr=sr, 
        n_mfcc=N_MFCC,
        hop_length=HOP_LENGTH
    )
    
    # Compute chroma features for additional matching
    chroma = librosa.feature.chroma_stft(
        y=audio_data,
        sr=sr,
        hop_length=HOP_LENGTH
    )
    
    # Combine features
    # Take mean and std of MFCCs across time
    mfcc_mean = np.mean(mfccs, axis=1)
    mfcc_std = np.std(mfccs, axis=1)
    chroma_mean = np.mean(chroma, axis=1)
    
    # Create fingerprint vector
    fingerprint = np.concatenate([mfcc_mean, mfcc_std, chroma_mean])
    
    return fingerprint


def compute_fingerprint_sequence(audio_data: np.ndarray, sr: int = SAMPLE_RATE, 
                                  window_size: float = 0.5) -> List[np.ndarray]:
    """Compute a sequence of fingerprints for sliding window matching.
    
    This allows matching shorter sounds within a longer audio segment.
    """
    if not AUDIO_LIBS_AVAILABLE:
        raise RuntimeError("Audio libraries not available")
    
    # Ensure mono
    if len(audio_data.shape) > 1:
        audio_data = librosa.to_mono(audio_data)
    
    # Resample if needed
    if sr != SAMPLE_RATE:
        audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=SAMPLE_RATE)
        sr = SAMPLE_RATE
    
    window_samples = int(window_size * sr)
    hop_samples = window_samples // 2  # 50% overlap
    
    fingerprints = []
    for start in range(0, len(audio_data) - window_samples, hop_samples):
        window = audio_data[start:start + window_samples]
        fp = compute_audio_fingerprint(window, sr)
        fingerprints.append(fp)
    
    return fingerprints


def compare_fingerprints(fp1: np.ndarray, fp2: np.ndarray) -> float:
    """Compare two fingerprints using cosine similarity.
    
    Returns a similarity score between 0 and 1 (1 = identical).
    """
    # Normalize vectors
    norm1 = np.linalg.norm(fp1)
    norm2 = np.linalg.norm(fp2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    fp1_normalized = fp1 / norm1
    fp2_normalized = fp2 / norm2
    
    # Cosine similarity
    similarity = np.dot(fp1_normalized, fp2_normalized)
    
    # Convert to 0-1 range (cosine similarity is -1 to 1)
    return (similarity + 1) / 2


def find_audio_match(stream_fingerprints: List[np.ndarray], 
                     target_fingerprint: np.ndarray,
                     threshold: float = DEFAULT_THRESHOLD,
                     trigger_name: str = "unknown") -> Tuple[bool, float]:
    """Check if target audio is present in stream fingerprints.
    
    Returns (match_found, best_similarity_score).
    """
    if not stream_fingerprints:
        logger.debug(f"[{trigger_name}] No stream fingerprints to compare")
        return False, 0.0
    
    best_score = 0.0
    scores = []
    for fp in stream_fingerprints:
        score = compare_fingerprints(fp, target_fingerprint)
        scores.append(score)
        if score > best_score:
            best_score = score
    
    # Log debug info about the match attempt (use INFO for visibility)
    avg_score = sum(scores) / len(scores) if scores else 0
    logger.info(f"[{trigger_name}] Match: best={best_score:.3f}, avg={avg_score:.3f}, threshold={threshold}, windows={len(scores)}")
    
    if best_score >= threshold:
        logger.info(f"[{trigger_name}] *** MATCH FOUND! *** Score: {best_score:.3f} >= {threshold}")
    
    return best_score >= threshold, best_score


async def load_audio_file(file_path: str) -> Tuple[np.ndarray, int]:
    """Load an audio file and return audio data and sample rate."""
    if not AUDIO_LIBS_AVAILABLE:
        raise RuntimeError("Audio libraries not available")
    
    # Load with librosa (handles MP3, WAV, etc.)
    audio_data, sr = librosa.load(file_path, sr=SAMPLE_RATE, mono=True)
    return audio_data, sr


async def load_audio_from_bytes(audio_bytes: bytes, format_hint: str = "mp3") -> Tuple[np.ndarray, int]:
    """Load audio from bytes (e.g., uploaded file)."""
    if not AUDIO_LIBS_AVAILABLE:
        raise RuntimeError("Audio libraries not available")
    
    # Write to temporary file
    suffix = f".{format_hint}"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    
    try:
        audio_data, sr = await load_audio_file(tmp_path)
        return audio_data, sr
    finally:
        os.unlink(tmp_path)


async def fetch_stream_chunk(station: str, duration: float = CHUNK_DURATION) -> Optional[bytes]:
    """Fetch a chunk of audio from the stream."""
    if station not in STREAM_URLS:
        logger.error(f"Unknown station: {station}")
        return None
    
    url = STREAM_URLS[station]
    
    # Calculate approximate bytes needed (assuming ~128kbps stream)
    # 128kbps = 16KB/s
    bytes_needed = int(duration * 16 * 1024)
    
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(duration + 5, read=duration + 5)) as client:
            async with client.stream("GET", url, follow_redirects=True) as response:
                if response.status_code != 200:
                    logger.error(f"Stream returned {response.status_code}")
                    return None
                
                chunks = []
                total_bytes = 0
                
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    chunks.append(chunk)
                    total_bytes += len(chunk)
                    
                    if total_bytes >= bytes_needed:
                        break
                
                return b"".join(chunks)
                
    except Exception as e:
        logger.error(f"Error fetching stream chunk from {station}: {e}")
        return None


async def analyze_stream_for_trigger(station: str, trigger_fingerprint: np.ndarray,
                                      threshold: float = DEFAULT_THRESHOLD,
                                      trigger_name: str = "unknown") -> Tuple[bool, float]:
    """Analyze a stream chunk and check for trigger audio.
    
    Returns (detected, similarity_score).
    """
    if not AUDIO_LIBS_AVAILABLE:
        return False, 0.0
    
    if not FFMPEG_AVAILABLE:
        logger.warning(f"[{trigger_name}] FFmpeg not available - cannot process audio stream")
        return False, 0.0
    
    # Fetch stream chunk
    logger.debug(f"[{trigger_name}] Fetching {CHUNK_DURATION}s audio from {station} stream...")
    audio_bytes = await fetch_stream_chunk(station)
    if not audio_bytes:
        logger.warning(f"[{trigger_name}] Failed to fetch stream chunk from {station}")
        return False, 0.0
    
    logger.debug(f"[{trigger_name}] Received {len(audio_bytes)} bytes from stream")
    
    try:
        # Save to temp file for processing
        with tempfile.NamedTemporaryFile(suffix=".stream", delete=False) as tmp:
            tmp.write(audio_bytes)
            input_path = tmp.name
        
        # Use ffmpeg to convert stream to WAV for proper decoding
        output_path = input_path + ".wav"
        
        try:
            import subprocess
            result = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", input_path,
                    "-acodec", "pcm_s16le",
                    "-ar", str(SAMPLE_RATE),
                    "-ac", "1",  # mono
                    output_path
                ],
                capture_output=True,
                timeout=10
            )
            
            if result.returncode != 0 or not os.path.exists(output_path):
                logger.warning(f"[{trigger_name}] FFmpeg conversion failed: {result.stderr.decode()[:200]}")
                return False, 0.0
            
            # Load the converted WAV file
            audio_data, sr = librosa.load(output_path, sr=SAMPLE_RATE, mono=True)
            
            # Check if we got valid audio data
            if audio_data is None or len(audio_data) == 0:
                logger.warning(f"[{trigger_name}] No audio data loaded from stream")
                return False, 0.0
            
            audio_duration = len(audio_data) / sr
            logger.debug(f"[{trigger_name}] Loaded {audio_duration:.2f}s of audio data")
            
            # Compute fingerprints for the stream chunk
            stream_fps = compute_fingerprint_sequence(audio_data, sr)
            
            if not stream_fps:
                logger.warning(f"[{trigger_name}] No fingerprints computed from stream (audio too short?)")
                return False, 0.0
            
            logger.debug(f"[{trigger_name}] Computed {len(stream_fps)} fingerprint windows")
            
            # Check for match
            return find_audio_match(stream_fps, trigger_fingerprint, threshold, trigger_name)
            
        finally:
            # Clean up temp files
            if os.path.exists(input_path):
                os.unlink(input_path)
            if os.path.exists(output_path):
                os.unlink(output_path)
            
    except Exception as e:
        import traceback
        logger.error(f"Error analyzing stream: {e}\n{traceback.format_exc()}")
        return False, 0.0


class AudioTriggerScheduler:
    """Background scheduler that monitors streams for audio triggers."""
    
    def __init__(self, db):
        self.db = db
        self.running = False
        self.check_interval = 3  # Seconds between checks during active windows
        self.task = None
        self.trigger_cache = {}  # Cache loaded fingerprints
        self.last_trigger_time = {}  # Prevent rapid re-triggers
        self.cooldown_seconds = 30  # Minimum time between same trigger detections
    
    async def start(self):
        """Start the audio trigger scheduler."""
        if self.running:
            logger.warning("Audio trigger scheduler is already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_loop())
        logger.info("Audio trigger scheduler started")
    
    async def stop(self):
        """Stop the audio trigger scheduler."""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Audio trigger scheduler stopped")
    
    def _is_in_time_window(self, windows: List[Dict]) -> bool:
        """Check if current time is within any of the configured windows.
        
        ALL times are in Brussels timezone (Europe/Brussels).
        """
        from services.timezone_utils import now_brussels as get_now_brussels
        
        now = get_now_brussels()
        current_time = now.strftime("%H:%M")
        current_weekday = now.weekday()  # 0=Monday
        
        for window in windows:
            start_time = window.get("start_time", "00:00")
            end_time = window.get("end_time", "23:59")
            days = window.get("days", [0, 1, 2, 3, 4, 5, 6])  # Default: all days
            
            if current_weekday not in days:
                continue
            
            if start_time <= current_time <= end_time:
                return True
        
        return False
    
    async def _load_trigger_fingerprint(self, trigger: Dict) -> Optional[np.ndarray]:
        """Load and cache the fingerprint for a trigger."""
        trigger_id = trigger["id"]
        
        # Check cache
        if trigger_id in self.trigger_cache:
            cache_entry = self.trigger_cache[trigger_id]
            # Invalidate cache if file changed
            if cache_entry.get("updated_at") == trigger.get("updated_at"):
                return cache_entry.get("fingerprint")
            # Also return None if we cached that this trigger has no valid path
            if cache_entry.get("no_valid_path"):
                return None
        
        # Load audio file
        in_sound_path = trigger.get("in_sound_path")
        if not in_sound_path or not os.path.exists(in_sound_path):
            # Cache this so we don't log repeatedly
            self.trigger_cache[trigger_id] = {
                "no_valid_path": True,
                "updated_at": trigger.get("updated_at")
            }
            # Only log once per trigger, not every 3 seconds
            logger.debug(f"Trigger {trigger_id} has no valid in_sound_path")
            return None
        
        try:
            audio_data, sr = await load_audio_file(in_sound_path)
            fingerprint = compute_audio_fingerprint(audio_data, sr)
            
            # Cache it
            self.trigger_cache[trigger_id] = {
                "fingerprint": fingerprint,
                "updated_at": trigger.get("updated_at")
            }
            
            return fingerprint
            
        except Exception as e:
            logger.error(f"Error loading trigger audio {trigger_id}: {e}")
            return None
    
    async def _load_out_fingerprint(self, trigger: Dict) -> Optional[np.ndarray]:
        """Load the OUT sound fingerprint for a trigger."""
        out_sound_path = trigger.get("out_sound_path")
        if not out_sound_path or not os.path.exists(out_sound_path):
            return None
        
        try:
            audio_data, sr = await load_audio_file(out_sound_path)
            return compute_audio_fingerprint(audio_data, sr)
        except Exception as e:
            logger.error(f"Error loading out sound: {e}")
            return None
    
    async def _handle_trigger_detected(self, trigger: Dict, is_in: bool):
        """Handle when a trigger sound is detected."""
        trigger_id = trigger["id"]
        station = trigger.get("station", "mfy")
        timestamp = datetime.now(timezone.utc).isoformat()
        
        if is_in:
            # IN sound detected - activate trigger action
            action_type = trigger.get("in_action_type", "custom_text")
            action_text = trigger.get("in_action_text", "")
            
            logger.info(f"Audio trigger IN detected: {trigger.get('name')} on {station}")
            
            # Update trigger state
            await self.db.audio_trigger_states.update_one(
                {"trigger_id": trigger_id, "station": station},
                {"$set": {
                    "is_active": True,
                    "activated_at": timestamp,
                    "action_type": action_type,
                    "action_text": action_text,
                    "updated_at": timestamp
                }},
                upsert=True
            )
            
            # Log detection
            await self.db.audio_trigger_logs.insert_one({
                "id": str(uuid.uuid4()),
                "trigger_id": trigger_id,
                "trigger_name": trigger.get("name"),
                "station": station,
                "event": "in_detected",
                "action_type": action_type,
                "action_text": action_text,
                "timestamp": timestamp
            })
            
        else:
            # OUT sound detected - deactivate trigger
            out_action_type = trigger.get("out_action_type", "now_playing")
            
            logger.info(f"Audio trigger OUT detected: {trigger.get('name')} on {station}")
            
            # Update trigger state
            await self.db.audio_trigger_states.update_one(
                {"trigger_id": trigger_id, "station": station},
                {"$set": {
                    "is_active": False,
                    "deactivated_at": timestamp,
                    "updated_at": timestamp
                }},
                upsert=True
            )
            
            # Log detection
            await self.db.audio_trigger_logs.insert_one({
                "id": str(uuid.uuid4()),
                "trigger_id": trigger_id,
                "trigger_name": trigger.get("name"),
                "station": station,
                "event": "out_detected",
                "action_type": out_action_type,
                "timestamp": timestamp
            })
    
    async def _check_timeout(self, trigger: Dict, state: Dict):
        """Check if an active trigger has timed out."""
        if not state or not state.get("is_active"):
            return
        
        timeout_minutes = trigger.get("timeout_minutes", 5)
        activated_at = state.get("activated_at")
        
        if not activated_at:
            return
        
        try:
            activated_time = datetime.fromisoformat(activated_at.replace("Z", "+00:00"))
            timeout_time = activated_time + timedelta(minutes=timeout_minutes)
            
            if datetime.now(timezone.utc) > timeout_time:
                # Timeout reached
                trigger_id = trigger["id"]
                station = trigger.get("station", "mfy")
                timestamp = datetime.now(timezone.utc).isoformat()
                
                logger.info(f"Audio trigger timeout: {trigger.get('name')} on {station}")
                
                await self.db.audio_trigger_states.update_one(
                    {"trigger_id": trigger_id, "station": station},
                    {"$set": {
                        "is_active": False,
                        "deactivated_at": timestamp,
                        "timeout": True,
                        "updated_at": timestamp
                    }},
                    upsert=True
                )
                
                await self.db.audio_trigger_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "trigger_id": trigger_id,
                    "trigger_name": trigger.get("name"),
                    "station": station,
                    "event": "timeout",
                    "timestamp": timestamp
                })
                
        except Exception as e:
            logger.error(f"Error checking timeout: {e}")
    
    async def _run_loop(self):
        """Main loop that checks for audio triggers."""
        while self.running:
            try:
                # Get all enabled triggers
                triggers = await self.db.audio_triggers.find(
                    {"enabled": True},
                    {"_id": 0}
                ).to_list(100)
                
                for trigger in triggers:
                    trigger_id = trigger["id"]
                    station = trigger.get("station", "mfy")
                    windows = trigger.get("time_windows", [])
                    
                    # Check if we're in an active time window
                    if windows and not self._is_in_time_window(windows):
                        continue
                    
                    trigger_name = trigger.get("name", trigger_id)
                    
                    # Get current state
                    state = await self.db.audio_trigger_states.find_one(
                        {"trigger_id": trigger_id, "station": station},
                        {"_id": 0}
                    )
                    
                    # Check for timeout on active triggers
                    await self._check_timeout(trigger, state)
                    
                    # Check cooldown
                    cooldown_key = f"{trigger_id}_{station}"
                    last_trigger = self.last_trigger_time.get(cooldown_key)
                    if last_trigger:
                        if (datetime.now(timezone.utc) - last_trigger).total_seconds() < self.cooldown_seconds:
                            continue
                    
                    is_active = state.get("is_active", False) if state else False
                    
                    if not is_active:
                        # Look for IN sound
                        in_fingerprint = await self._load_trigger_fingerprint(trigger)
                        if in_fingerprint is not None:
                            threshold = trigger.get("threshold", DEFAULT_THRESHOLD)
                            detected, score = await analyze_stream_for_trigger(
                                station, in_fingerprint, threshold, trigger_name
                            )
                            
                            if detected:
                                await self._handle_trigger_detected(trigger, is_in=True)
                                self.last_trigger_time[cooldown_key] = datetime.now(timezone.utc)
                    else:
                        # Currently active - look for OUT sound
                        out_fingerprint = await self._load_out_fingerprint(trigger)
                        if out_fingerprint is not None:
                            threshold = trigger.get("threshold", DEFAULT_THRESHOLD)
                            detected, score = await analyze_stream_for_trigger(
                                station, out_fingerprint, threshold, f"{trigger_name}_OUT"
                            )
                            
                            if detected:
                                await self._handle_trigger_detected(trigger, is_in=False)
                                self.last_trigger_time[cooldown_key] = datetime.now(timezone.utc)
                
                await asyncio.sleep(self.check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Audio trigger scheduler error: {e}")
                await asyncio.sleep(10)


async def get_active_audio_trigger(db, station: str) -> Optional[Dict]:
    """Get the currently active audio trigger for a station.
    
    Returns the trigger state if one is active, or None.
    """
    # Check for active trigger state
    state = await db.audio_trigger_states.find_one(
        {"station": {"$in": [station, "both"]}, "is_active": True},
        {"_id": 0}
    )
    
    if not state:
        return None
    
    return {
        "active": True,
        "trigger_id": state.get("trigger_id"),
        "action_type": state.get("action_type"),
        "action_text": state.get("action_text"),
        "activated_at": state.get("activated_at")
    }


# Global scheduler instance (initialized in server.py)
audio_trigger_scheduler = None
