import Dropzone from "./components/Dropzone";
import Sidebar from "./components/Sidebar";

import "./App.css";

function App() {
  const handleUpload = () => {
    console.log("Upload clicked");
    // Add logic here
  };

  const handleHistory = () => {
    console.log("History clicked");
    // Add logic here
  };

  const handleConsult = () => {
    console.log("Consult CXR clicked");
    // Add logic here
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar positioned on the left */}
      <Sidebar
        onUpload={handleUpload}
        onHistory={handleHistory}
        onConsult={handleConsult}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Upload Files
            </h1>
          </div>
        </header>

        <main className="flex-1">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <Dropzone />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;