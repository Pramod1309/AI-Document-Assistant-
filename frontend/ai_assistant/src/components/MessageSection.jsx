import React, { useEffect, useState } from "react";
import { FaPaperclip, FaDownload } from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FilePreviewModal from "./FilePreviewModal";
import PropTypes from 'prop-types';
import './MessageSection.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by Error Boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-red-500 p-4 bg-gray-800 rounded m-4">
          Something went wrong in the message section. display. Please try refreshing the page.
          again.
        </div>
      );
    }
    return this.props.children;
  }
}

const MessageSection = ({ messages, typingMessage, isProcessing, onDownload, onDownloadAll, user }) => {
  const [previewUrls, setPreviewUrls] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);

  // Extract username from email (e.g., "abcd123@gmail.com" -> "abcd")
  const getUsername = (email) => {
    if (!email) return "User";
    const name = email.split("@")[0]; // Get part before @
    return name.replace(/[0-9]/g, ""); // Remove numbers
  };

  // File type to color mapping
  const fileTypeColors = {
    pdf: "bg-red-500",
    doc: "bg-blue-500",
    docx: "bg-blue-500",
    ppt: "bg-orange-500",
    pptx: "bg-orange-500",
    xls: "bg-green-500",
    xlsx: "bg-green-500",
    jpg: "bg-purple-500",
    jpeg: "bg-purple-500",
    png: "bg-purple-500",
    gif: "bg-purple-500",
    txt: "bg-gray-500",
    default: "bg-indigo-500",
  };

  const getFileTypeColor = (fileName) => {
    const extension = (fileName || "").split(".").pop().toLowerCase();
    return fileTypeColors[extension] || fileTypeColors["default"];
  };

  const getFileIcon = (fileName) => {
    const extension = (fileName || "").split(".").pop().toLowerCase();
    switch(extension) {
      case 'pdf': return '📄';
      case 'doc':
      case 'docx': return '📝';
      case 'ppt':
      case 'pptx': return '📊';
      case 'xls':
      case 'xlsx': return '📈';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return '🖼️';
      default: return '📎';
    }
  };

  useEffect(() => {
    const newPreviewUrls = {};
    messages.forEach((msg, msgIndex) => {
      if (msg.files && msg.files.length > 0) {
        msg.files.forEach((file, fileIndex) => {
          const fileKey = `${msgIndex}-${fileIndex}`;
          if (file.url && typeof file.url === 'string') {
            newPreviewUrls[fileKey] = file.url;
          } else if (file instanceof File || file instanceof Blob) {
            newPreviewUrls[fileKey] = URL.createObjectURL(file);
          } else {
              console.warn(`Skipping invalid file object at message ${msgIndex}, file ${fileIndex}:`, file);
          }
        });
      }
    });
    setPreviewUrls(newPreviewUrls);
    return () => {
      Object.values(newPreviewUrls).forEach((url) => {
        if (url && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [messages]);

  const isImageFile = (file) => {
    const mimeType = file.type || file.mimeType || "";
    const extension = (file.name || file.url || "").split(".").pop()?.toLowerCase() || "";
    return (
      mimeType.startsWith("image/") ||
      ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)
    );
  };

  const renderFilePreview = (file, msgIndex, fileIndex) => {
    const fileKey = `${msgIndex}-${fileIndex}`;
    const previewUrl = previewUrls[fileKey];
    const fileName = file.name || file.url?.split("/").pop() || "FILE";

    if (previewUrl && isImageFile(file)) {
      return (
        <div className="relative">
          <img
            src={previewUrl}
            alt={fileName}
            className="w-16 h-16 rounded-lg border object-cover cursor-pointer hover:opacity-80 transition"
            onError={(e) => {
              e.target.style.display = "none";
              console.error(`Image load failed for ${fileName}`);
            }}
            onClick={() => setSelectedFile(file)}
          />
        </div>
      );
    }

    return (
      <div
        className={`w-16 h-16 rounded-lg border flex flex-col items-center justify-center ${getFileTypeColor(fileName)} cursor-pointer hover:opacity-80 transition`}
        onClick={() => setSelectedFile(file)}
      >
        <span className="text-white text-2xl">
          {getFileIcon(fileName)}
        </span>
        <span className="text-white text-xs mt-1">
          {fileName.split(".").pop().toUpperCase()}
        </span>
      </div>
    );
  };

  // Derive user email from messages if user?.email is unavailable
  const userEmail = user?.email || messages.find(msg => msg.sender === "user")?.senderEmail;

  return (
    <ErrorBoundary>
      <div className="flex-1 bg-[#0A1931] text-white p-6 overflow-y-auto h-[80vh] flex flex-col items-center">
        <style>
          {`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fadeIn {
              animation: fadeIn 0.5s ease-out;
            }
          `}
        </style>
        <div className="w-full max-w-3xl space-y-4">
          {messages.length === 0 && !typingMessage && !isProcessing ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-center max-w-lg mx-auto animate-fadeIn">
                {userEmail ? (
                  <h2 className="text-xl md:text-2xl font-semibold text-gray-200 pt-40">
                    Hello {getUsername(userEmail)} !! What can I do for you? 😊
                  </h2>
                ) : (
                  <h2 className="text-xl md:text-2xl text-gray-200 welcome-font pt-40">
                    Hello My Friend !!! I am your personal assistant specially trained for document operations. How can I assist you? 😊
                  </h2>
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, msgIndex) => (
                <div
                  key={msgIndex}
                  className={`flex w-full ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] p-4 rounded-xl shadow-md ${
                      msg.sender === "user"
                        ? "bg-gray-800"
                        : "bg-gray-800"
                    } transition-all duration-200 break-words animate-fade-in`}
                  >
                    <p className="text-xs font-semibold mb-2 opacity-80">
                      {msg.sender === "user" ? "You" : "AI Assistant"}
                    </p>
                    <div className="prose prose-invert max-w-none mb-3">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>

                    {msg.files && msg.files.length > 0 && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {msg.files.map((file, fileIndex) => (
                            <div
                              key={fileIndex}
                              className="bg-gray-700 p-3 rounded-lg flex items-start space-x-3"
                            >
                              {renderFilePreview(file, msgIndex, fileIndex)}
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm truncate"
                                  title={file.name || file.url}
                                >
                                  {file.name || file.url?.split("/").pop()}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {file.size
                                    ? `${(file.size / 1024).toFixed(2)} KB`
                                    : ""}
                                </p>
                                <div className="flex space-x-3 mt-2">
                                  <button
                                    onClick={() => setSelectedFile(file)}
                                    className="text-blue-400 hover:text-blue-300 text-xs flex items-center"
                                  >
                                    <span>Preview</span>
                                  </button>
                                  <button
                                    onClick={() => onDownload(file.url || URL.createObjectURL(file), file.name || file.url?.split('/').pop())}
                                    className="text-blue-400 hover:text-blue-300 text-xs flex items-center"
                                  >
                                    <FaDownload className="mr-1" />
                                    <span>Download</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {msg.files.length > 1 && (
                          <button
                            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center"
                            onClick={() => onDownloadAll(msg.files)}
                          >
                            <FaDownload className="mr-2" />
                            Download All Files
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {typingMessage && (
                <div className="flex justify-start w-full animate-fade-in">
                  <div className="max-w-[70%] p-4 rounded-xl shadow-md bg-gray-700 border border-gray-600 transition-all duration-200 break-words">
                    <p className="text-xs font-semibold mb-2 opacity-80">AI Assistant</p>
                    <div className="prose prose-invert max-w-none flex items-end">
                      {isProcessing && !typingMessage.text ? (
                        <div className="flex items-center space-x-2">
                          <div className="dot-loader"></div>
                          <p className="text-xs text-gray-300">Processing...</p>
                        </div>
                      ) : (
                        <>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {typingMessage.text}
                          </ReactMarkdown>
                          <span className="animate-blink text-white text-lg ml-1">|</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {selectedFile && (
        <FilePreviewModal file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </ErrorBoundary>
  );
};

MessageSection.propTypes = {
  messages: PropTypes.arrayOf(
    PropTypes.shape({
      text: PropTypes.string.isRequired,
      sender: PropTypes.oneOf(["user", "assistant"]).isRequired,
      files: PropTypes.arrayOf(
        PropTypes.shape({
          name: PropTypes.string,
          url: PropTypes.string,
          type: PropTypes.string,
          size: PropTypes.number,
        })
      ),
    })
  ).isRequired,
  typingMessage: PropTypes.shape({
    id: PropTypes.number,
    text: PropTypes.string,
    sender: PropTypes.string,
  }),
  isProcessing: PropTypes.bool,
  onDownload: PropTypes.func.isRequired,
  onDownloadAll: PropTypes.func.isRequired,
  user: PropTypes.shape({
    email: PropTypes.string,
    isAuthenticated: PropTypes.bool,
  }),
};

export default MessageSection;