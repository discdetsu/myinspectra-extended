import { useState } from "react";
import Dropzone from "./components/Dropzone";
import Sidebar from "./components/Sidebar";
import History from "./components/History";

import "./App.css";

function App() {
  const [currentPage, setCurrentPage] = useState<'upload' | 'history' | 'consult'>('upload');

  const handleUpload = () => {
    setCurrentPage('upload');
  };

  const handleHistory = () => {
    setCurrentPage('history');
  };

  const handleConsult = () => {
    setCurrentPage('consult');
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case 'upload':
        return 'Upload Files';
      case 'history':
        return 'Analysis History';
      case 'consult':
        return 'Consult CXR';
      default:
        return 'Upload Files';
    }
  };

  const getPageContent = () => {
    switch (currentPage) {
      case 'upload':
        return <Dropzone />;
      case 'history':
        return <History />;
      case 'consult':
        return <div>Consult page coming soon...</div>;
      default:
        return <Dropzone />;
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        onUpload={handleUpload}
        onHistory={handleHistory}
        onConsult={handleConsult}
      />

      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {getPageTitle()}
            </h1>
          </div>
        </header>

        <main className="flex-1">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            {getPageContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
