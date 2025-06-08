import React, { useEffect, useState } from "react";
import { FaTimes, FaDownload } from "react-icons/fa";

const FilePreviewModal = ({ file, onClose }) => {
  const [previewUrl, setPreviewUrl] = useState("");
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [extension, setExtension] = useState("");
  const [mimeType, setMimeType] = useState("");

  useEffect(() => {
    if (!file) return;

    const generatePreview = async () => {
      try {
        let url = "";
        let isRemote = false;

        // Determine if the file is remote (has url) or local (File object)
        if (file.url) {
          url = file.url;
          isRemote = true;
        } else if (file instanceof File || file instanceof Blob) {
          url = URL.createObjectURL(file);
        } else {
          throw new Error("Invalid file object");
        }

        // Normalize file metadata
        const name = file.name || (file.url ? file.url.split("/").pop() : "unknown");
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const type = file.type || (ext ? `application/${ext}` : "application/octet-stream");

        setFileName(name);
        setExtension(ext);
        setMimeType(type);

        // Handle different file types
        if (
          type.startsWith("image/") ||
          ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
        ) {
          setPreviewUrl(url);
          setContent("image");
        } else if (
          type === "application/pdf" ||
          ext === "pdf"
        ) {
          setPreviewUrl(url);
          setContent("pdf");
        } else if (
          type.startsWith("text/") ||
          ["txt", "md", "js", "jsx", "json", "css", "html"].includes(ext)
        ) {
          if (!isRemote) {
            const text = await file.text();
            setPreviewUrl(text);
            setContent("text");
          } else {
            try {
              const response = await fetch(url, { credentials: "include" });
              if (!response.ok) throw new Error("Failed to fetch text file");
              const text = await response.text();
              setPreviewUrl(text);
              setContent("text");
            } catch (err) {
              setContent("unsupported");
              setError("Text preview not available for remote files");
            }
          }
        } else if (
          ["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(ext)
        ) {
          setContent("office");
          setPreviewUrl(url);
          setError(`Preview not supported for ${ext.toUpperCase()} files. You can download the file.`);
        } else if (
          ["zip", "rar"].includes(ext)
        ) {
          setContent("archive");
          setPreviewUrl(url);
          setError(`Preview not supported for ${ext.toUpperCase()} files. You can download the archive.`);
        } else {
          setContent("unsupported");
          setPreviewUrl(url);
          setError(`No preview available for ${name}`);
        }
      } catch (err) {
        setContent("error");
        setError("Failed to load preview");
        console.error("Preview error:", err);
      }
    };

    generatePreview();

    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file]);

  const renderContent = () => {
    switch (content) {
      case "image":
        return (
          <img
            src={previewUrl}
            alt={fileName || "Image"}
            className="max-w-full max-h-[80vh] object-contain mx-auto"
            onError={() => {
              setContent("error");
              setError("Failed to load image");
            }}
          />
        );
      case "pdf":
        return (
          <iframe
            src={previewUrl}
            title={fileName || "PDF"}
            className="w-full h-[80vh] border-none"
            style={{ backgroundColor: "#fff" }}
          />
        );
      case "text":
        return (
          <pre className="text-white bg-gray-800 p-4 rounded w-full max-h-[80vh] overflow-auto whitespace-pre-wrap">
            {previewUrl}
          </pre>
        );
      case "office":
      case "archive":
      case "unsupported":
      case "error":
        return (
          <div className="text-white text-center p-4 flex flex-col items-center">
            <div className="mb-4">
              {error || `No preview available for ${fileName}`}
            </div>
            {(file.url || previewUrl) && (
              <a
                href={file.url || previewUrl}
                download={fileName}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center"
              >
                <FaDownload className="mr-2" />
                Download File
              </a>
            )}
          </div>
        );
      default:
        return <div className="text-white text-center p-4">Loading preview...</div>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-[#0A1931] p-6 rounded-lg w-[90%] max-w-4xl relative flex flex-col max-h-[90vh]">
        <button
          className="absolute top-2 right-2 text-white hover:text-red-500"
          onClick={onClose}
        >
          <FaTimes size={24} />
        </button>
        <h2 className="text-white text-xl mb-4 text-center truncate">
          {fileName || "Preview"}
        </h2>
        <div className="flex-1 overflow-y-auto">{renderContent()}</div>
      </div>
    </div>
  );
};

export default FilePreviewModal;