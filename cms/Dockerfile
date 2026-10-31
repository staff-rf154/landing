FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    SITE_DIR=/app

WORKDIR /app

COPY cms/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cms/app.py .
COPY cms/templates ./templates
COPY cms/static ./static
COPY styles.css app.js robots.txt sitemap.xml e93abb77d7c6937715c3c6b4c515e556.txt ./
COPY assets ./assets

RUN mkdir -p /data/uploads /data/backups

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
