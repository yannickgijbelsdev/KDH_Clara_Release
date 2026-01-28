"""Database connection and configuration."""
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'radio-show-planner-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Role definitions
ROLES = ["admin", "editor", "presenter", "viewer"]

# Upload directories
UPLOADS_DIR = ROOT_DIR / 'uploads' / 'featured_images'
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MEDIA_UPLOADS_DIR = ROOT_DIR / 'uploads' / 'media'
MEDIA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

AVATARS_DIR = ROOT_DIR / 'uploads' / 'avatars'
AVATARS_DIR.mkdir(parents=True, exist_ok=True)

SHOW_IMAGES_DIR = ROOT_DIR / 'uploads' / 'show_images'
SHOW_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
