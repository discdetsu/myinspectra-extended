# InspectraCXR - Frontend

A modern React-based web application for chest X-ray (CXR) analysis and medical imaging processing. This frontend provides an intuitive interface for healthcare professionals to upload, analyze, and review chest X-ray images using AI-powered diagnostic tools.

## 🚀 Features

- **🖼️ Image Upload & Processing**: Drag-and-drop interface for uploading chest X-ray images
- **🧠 AI-Powered Analysis**: Integration with CXR v4 AI services for:
  - Abnormality detection
  - Pneumothorax identification
  - Tuberculosis screening
- **📊 Heatmap Visualization**: Visual heatmaps showing areas of interest identified by AI
- **📈 Analysis History**: Track and review previous X-ray analyses
- **👩‍⚕️ Consultation Interface**: Professional consultation features (coming soon)
- **📱 Responsive Design**: Modern, mobile-friendly interface built with TailwindCSS

## 🛠️ Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6.2
- **Styling**: TailwindCSS 4.1
- **File Upload**: React Dropzone 14.3
- **Icons**: Lucide React
- **Linting**: ESLint with TypeScript support

## 📋 Prerequisites

- Node.js (version 18 or higher)
- npm or yarn package manager
- Backend API services running (Django + FastAPI)

## 🚀 Getting Started

### Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Linting

```bash
npm run lint
```

## 🏗️ Project Structure

```
src/
├── components/
│   ├── Dropzone.tsx      # File upload and image processing
│   ├── History.tsx       # Analysis history viewer
│   └── Sidebar.tsx       # Navigation sidebar
├── App.tsx               # Main application component
├── main.tsx             # Application entry point
└── assets/              # Static assets
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_CXR_SERVICE_URL=http://0.0.0.0:50011
```

### AI Service Integration

The application integrates with the CXR v4 service for image processing. The service provides:

- **Heatmap Generation**: Visual overlays showing diagnostic areas
- **Multi-Service Analysis**: Abnormality, pneumothorax, and tuberculosis detection
- **Configurable Parameters**: User profile settings for display preferences

## 📊 API Integration

The frontend communicates with:

1. **Django Backend**: User management, data persistence, and report generation
2. **CXR v4 Service**: AI-powered image analysis and processing
3. **Storage Service**: Image and report file management

## 🎨 UI Components

### File Upload (Dropzone)
- Drag-and-drop functionality
- Image preview with original and processed views
- Upload progress indicators
- File validation and error handling

### Analysis History
- Timeline view of previous analyses
- Searchable and filterable results
- Quick access to reports and images

### Sidebar Navigation
- Clean, professional design
- Role-based navigation options
- Quick access to main features

## 🔒 Security Features

- File type validation for medical images
- Secure API communication
- User session management
- CORS configuration for cross-origin requests

## 🧪 Testing

```bash
# Run tests (when test suite is added)
npm run test
```

## 📦 Dependencies

### Core Dependencies
- `react` & `react-dom`: UI framework
- `react-dropzone`: File upload functionality
- `lucide-react`: Icon library
- `uuid`: Unique identifier generation

### Development Dependencies
- `typescript`: Type safety
- `@vitejs/plugin-react`: React support for Vite
- `eslint`: Code linting
- `tailwindcss`: Utility-first CSS framework

## 🤝 Contributing

1. Follow the existing code style and TypeScript conventions
2. Use meaningful component and variable names
3. Ensure responsive design across devices
4. Test file upload functionality thoroughly
5. Update documentation for new features

## 🔄 Integration with Backend

This frontend is designed to work with:
- **Django API**: User management and data persistence
- **FastAPI Services**: Real-time image processing
- **PostgreSQL**: Database storage
- **MinIO**: Object storage for images and reports

## 📝 License

Part of the MyInspectra Extended medical imaging platform.

---

For backend setup and API documentation, see the main project README.
