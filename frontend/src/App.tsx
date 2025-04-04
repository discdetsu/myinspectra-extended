import React from 'react';
import ImageUploader from './ImageUploader';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold text-center mb-6">Image Uploader</h1>
      <ImageUploader />
    </div>
  );
};

export default App;