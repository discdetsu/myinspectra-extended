import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

export default function FileDropzone() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setUploadSuccess(null);
    setProcessedImageUrl(null);
    
    // Create preview URL for the first file
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    multiple: false,
    accept: { "image/*": [] },
  });

  const handleUpload = async () => {
    if (!files.length) return;

    const file = files[0];
    const requestId = uuidv4().slice(0, 12);

    const params = new URLSearchParams({
      request_id: "123456",
      enable_heatmap_flag: "1",
      user_profile: JSON.stringify({
        user_profile: {
          pacs_display_color: "color",
          nipple_marker: "disable",
          deeplearning_services: [
            "abnormality",
            "pneumothorax",
            "tuberculosis",
          ],
        },
      }),
    });

    const endpoint = `http://0.0.0.0:50011/upload-image?${params.toString()}`;

    try {
      setIsUploading(true);
      setUploadSuccess(null);

      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(endpoint, {
        method: "POST",
        //   headers: {
        //     "Content-Type": "application/x-image",
        //     "Content-Disposition": `attachment; filename=${requestId}.png`,
        //     Authorization: "Bearer 123456789",
        //   },
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const processedUrl = URL.createObjectURL(blob);
        setProcessedImageUrl(processedUrl);
        setUploadSuccess(true);
      } else {
        setUploadSuccess(false);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadSuccess(false);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((file) => file.name !== fileName));
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (processedImageUrl) {
      URL.revokeObjectURL(processedImageUrl);
      setProcessedImageUrl(null);
    }
    setUploadSuccess(null);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {!files.length && (
        <div
          {...getRootProps()}
          className={`
            flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition-all duration-200
            ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:bg-gray-50"}
          `}
        >
          <input {...getInputProps()} />
          <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
          <p className="text-gray-600 text-center">
            {isDragActive ? "Drop the files here ..." : "Drag & drop files here, or click to select files"}
          </p>
          <button
            type="button"
            onClick={open}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700"
          >
            Browse Files
          </button>
        </div>
      )}

      {files.length > 0 && (
        <>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original Image Preview */}
              {previewUrl && (
                <div className="relative">
                  <h3 className="text-lg font-semibold mb-2">Original Image</h3>
                  <div className="relative">
                    <img
                      src={previewUrl}
                      alt="Original"
                      className="w-full h-auto rounded-xl"
                    />
                    <button
                      onClick={() => removeFile(files[0].name)}
                      className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md text-gray-500 hover:text-red-500"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Processed Image Preview */}
              {processedImageUrl && (
                <div className="relative">
                  <h3 className="text-lg font-semibold mb-2">AI Processed Image</h3>
                  <img
                    src={processedImageUrl}
                    alt="Processed"
                    className="w-full h-auto rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* File Info */}
            <div className="flex items-center justify-between p-3 bg-gray-100 rounded-xl">
              <span className="text-sm text-gray-800">{files[0].name}</span>
              <span className="text-xs text-gray-500">
                {(files[0].size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center space-x-3">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className={`px-4 py-2 rounded-xl text-white font-medium ${
                isUploading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {isUploading ? (
                <span className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </span>
              ) : (
                "Process Image"
              )}
            </button>

            {uploadSuccess === true && (
              <span className="flex items-center text-green-600">
                <CheckCircle className="w-5 h-5 mr-1" />
                Processing Complete!
              </span>
            )}
            {uploadSuccess === false && (
              <span className="flex items-center text-red-600">
                <XCircle className="w-5 h-5 mr-1" />
                Processing failed.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
