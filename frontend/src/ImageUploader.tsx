import React, { useState, ChangeEvent } from "react";
import { Button } from "./components/ui/button"; // adjust path as needed

const ImageUploader: React.FC = () => {
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setFileName(file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white shadow-xl rounded-2xl p-6 w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-4 text-center">Upload an Image</h1>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="mb-4"
        />
        {image && (
          <div className="mb-4">
            <img src={image} alt="Uploaded preview" className="rounded-lg shadow-md" />
            <p className="mt-2 text-sm text-gray-600 text-center">{fileName}</p>
          </div>
        )}
        <Button className="w-full" disabled={!image}>
          Submit
        </Button>
      </div>
    </div>
  );
};

export default ImageUploader;
