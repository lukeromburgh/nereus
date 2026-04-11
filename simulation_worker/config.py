from celery import Celery
import os
import sys

# Django ORM bootstrap — add backend to path and configure settings.
_BACKEND_DIR = os.environ.get('DJANGO_BACKEND_DIR', '/backend')
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nereus_core.settings')

import django
django.setup()

# Celery configuration
broker_url = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0')
result_backend = os.environ.get('CELERY_RESULT_BACKEND', broker_url)

app = Celery('tasks', broker=broker_url, backend=result_backend)
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)

# API endpoints
DJANGO_API_URL = os.environ.get(
    'DJANGO_API_URL',
    'http://host.docker.internal:8000/api/runs',
)

DJANGO_MEDIA_ROOT = os.environ.get('DJANGO_MEDIA_ROOT', '/data/media')

__all__ = ['app', 'DJANGO_API_URL', 'DJANGO_MEDIA_ROOT', 'broker_url', 'result_backend']
