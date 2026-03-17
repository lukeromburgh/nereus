FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file if it exists, otherwise just install what we know we need
# We install Django, DRF, Celery, psycopg2, corsheaders
RUN pip install --upgrade pip
RUN pip install Django==5.1.7 djangorestframework celery redis psycopg2-binary django-cors-headers requests

COPY . /app/

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
