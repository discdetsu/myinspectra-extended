# MyInspectra Extended

A medical imaging platform for chest X-ray (CXR) analysis with AI-powered diagnostic tools.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, nginx
- **Backend**: Django 6.0, PostgreSQL, Gunicorn
- **AI Services**: FastAPI
- **Storage**: MinIO (S3-compatible)
- **Package Manager**: uv (Python), npm (Node.js)

## Features

- X-ray image upload (DICOM, PNG, JPEG)
- AI-powered abnormality detection with heatmap overlays
- Multi-version model comparison (v3.5.1, v4.5.0)
- Analysis history tracking
- PDF report generation

---

## Quick Start (Docker)

### 1. Clone and Setup Environment

```bash
git clone <repository-url>
cd myinspectra-extended

# Copy environment file and configure
cp .env.sample .env

# Edit .env with your settings (Django admin, MinIO credentials, etc.)
vim .env
```

### 2. Build Images

```bash
# Build all services
docker compose build

# Or build specific services
docker compose build frontend backend
```

### 3. Start Core Services

```bash
# Start database and storage first
docker compose up -d db minio createbuckets

# Wait a few seconds for services to initialize, then start backend
docker compose up -d backend

# Start frontend
docker compose up -d frontend
```

### 4. Initialize Django

```bash
# Run migrations
docker exec myinspectra_django uv run python manage.py makemigrations
docker exec myinspectra_django uv run python manage.py migrate

# Create superuser
docker exec myinspectra_django uv run python scripts/create_superuser.py

# Populate database with service configurations
docker exec myinspectra_django uv run python scripts/populate_db.py
```

### 5. Start AI Services

```bash
# Start all AI prediction and segmentation services
docker compose up -d abnormality_v3 abnormality_v4 tuberculosis pneumothorax
docker compose up -d pleural_effusion_segmentation lung_segmentation pneumothorax_segmentation
```

### 6. Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Django Admin | http://localhost:8000/admin |
| MinIO Console | http://localhost:9001 |

---

## Development Setup

### Frontend (Local Development)

```bash
cd frontend
npm install
npm run dev
```

### Backend (Local Development)

```bash
cd backend
uv sync
uv run python manage.py runserver
```

---

## Useful Commands

```bash
# View logs
docker logs -f myinspectra_django
docker logs -f myinspectra_frontend

# Restart services
docker compose restart backend frontend

# Stop all services
docker compose down

# Reset database (WARNING: deletes all data)
docker compose down -v
rm -rf .database
docker compose up -d
```

---

## Environment Variables

Key variables in `.env`:

| Variable | Description |
|----------|-------------|
| `DJANGO_ADMIN_USERNAME` | Django superuser username |
| `DJANGO_ADMIN_PASSWORD` | Django superuser password |
| `MINIO_ROOT_USER` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | MinIO admin password |
| `MINIO_BUCKET_NAME` | S3 bucket for storing images |
| `ABNORMALITY_V*_URL` | Abnormality detection service URLs |
| `TUBERCULOSIS_URL` | Tuberculosis detection service URL |
| `PNEUMOTHORAX_URL` | Pneumothorax detection service URL |

---

## Project Structure

```
myinspectra-extended/
├── frontend/           # React + Vite frontend
├── backend/            # Django backend
├── deeplearning_api/   # AI microservices
│   ├── abnormality_v3.5.1/
│   ├── abnormality_v4.5.0/
│   ├── tuberculosis/
│   ├── pneumothorax/
│   ├── lung_segmentation/
│   ├── pleural_effusion_segmentation/
│   └── pneumothorax_segmentation/
├── docker-compose.yml
└── .env.sample
```
