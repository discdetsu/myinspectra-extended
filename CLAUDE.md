# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyInspectra Extended is a medical imaging platform for chest X-ray (CXR) analysis. The system combines AI-powered diagnostic tools with a modern web interface for healthcare professionals.

## Architecture

The project uses a multi-service architecture:

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS (port 3000/5173)
- **Backend**: Django 5.2 with SQLite database (port 8000) 
- **Additional Services**: FastAPI services for AI processing
- **Storage**: MinIO for object storage (port 9000/9001)
- **Database**: PostgreSQL in production, SQLite in development

## Development Commands

### Frontend (React/TypeScript)
Navigate to `frontend/` directory:
```bash
npm install          # Install dependencies
npm run dev          # Development server (http://localhost:5173)
npm run build        # Production build (TypeScript compilation + Vite build)
npm run lint         # ESLint with TypeScript support
npm run preview      # Preview production build
```

### Backend (Django)
Navigate to `backend/` directory:
```bash
python manage.py runserver           # Development server (http://localhost:8000)
python manage.py migrate            # Apply database migrations
python manage.py makemigrations     # Create new migrations
python manage.py createsuperuser    # Create admin user
python manage.py test               # Run Django tests
```

### Docker Development
```bash
docker-compose up        # Start all services
docker-compose down      # Stop all services
docker-compose build     # Rebuild containers
```

## Key Components

### Frontend Structure
- `src/App.tsx`: Main application with page routing (upload/history/consult)
- `src/components/Dropzone.tsx`: File upload and image processing interface
- `src/components/History.tsx`: Analysis history viewer
- `src/components/Sidebar.tsx`: Navigation sidebar

### Backend Structure
- `backend/api/models.py`: Core data models (User, Prediction, Report)
- `backend/api/views.py`: API endpoints
- `backend/api/admin.py`: Django admin configuration

### Data Models
- **User**: Patient information (firstname, lastname, phone, joined_date)
- **Prediction**: X-ray analysis results (user, image, result JSON, created_at)
- **Report**: Generated PDF reports (pdf file, prediction, created_at)

## API Integration

The frontend integrates with:
1. **Django Backend**: User management, data persistence, report generation
2. **CXR v4 Service**: AI-powered image analysis (abnormality, pneumothorax, tuberculosis detection)
3. **Storage Service**: Image and report file management via MinIO

## Environment Configuration

### Frontend Environment Variables
Create `.env` in `frontend/`:
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_CXR_SERVICE_URL=http://0.0.0.0:50011
```

### Database
- Development: SQLite (`backend/db.sqlite3`)
- Production: PostgreSQL (configured in docker-compose.yml)

## Development Workflow

1. **Frontend Development**: Use `npm run dev` in `frontend/` for hot-reload development
2. **Backend Development**: Use `python manage.py runserver` in `backend/` for Django development
3. **Database Changes**: Create migrations with `makemigrations`, apply with `migrate`
4. **Linting**: Run `npm run lint` in frontend for code quality checks
5. **Full Stack**: Use `docker-compose up` to run the entire stack with all services

## File Upload Flow

1. User uploads X-ray image via Dropzone component
2. Image sent to CXR v4 service for AI analysis
3. Results stored in Prediction model with heatmap generation
4. Reports generated and stored via Report model
5. History accessible through History component