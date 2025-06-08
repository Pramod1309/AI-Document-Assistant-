# backend/build.sh
#!/usr/bin/env bash
set -o errexit

# Install system dependencies
apt-get update
apt-get install -y wkhtmltopdf ghostscript poppler-utils

# Install Python dependencies
pip install -r requirements.txt

# Collect static files
python manage.py collectstatic --no-input

# Run migrations
python manage.py migrate
