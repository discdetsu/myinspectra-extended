# MyInspectra Extended

A medical imaging platform for chest X-ray (CXR) analysis with AI-powered diagnostic tools.

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Access at http://localhost:5173

### Backend
```bash
cd backend
python manage.py migrate
python manage.py runserver
```
Access at http://localhost:8000

### Docker (Full Stack)
```bash
docker-compose up
```

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Django 5.2, PostgreSQL
- **AI Services**: FastAPI
- **Storage**: MinIO

## Features

- X-ray image upload and analysis
- AI-powered abnormality detection
- Analysis history tracking
- PDF report generation
