import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import API_BASE_URL from "./config";
import LoginModal from "./components/LoginModal";
import Navbar from "./components/Navbar";
import MessageSection from "./components/MessageSection";
import Chatbar from "./components/Chatbar";
import HistoryModal from "./components/HistoryModal";

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
        <div className="h-screen flex flex-col bg-[#0A1931] items-center justify-center text-white">
          <p className="text-red-500 mb-4">Something went wrong. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [typingMessage, setTypingMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunkQueue, setChunkQueue] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const eventSourceRef = useRef(null);

  // Fetch chat history from backend
  const fetchChatHistory = async () => {
  if (!user?.isAuthenticated) {
    console.log("User not authenticated, skipping chat history fetch");
    setChatHistory([]);
    return;
  }
  setIsHistoryLoading(true);
  try {
    console.log("Fetching chat history for user:", user.email);
    const response = await axios.get(`${API_BASE_URL}chat-history/`, {
      withCredentials: true,
    });
    console.log("Chat history response:", response.data);
    setChatHistory(response.data.chats || []);
  } catch (error) {
    console.error("Error fetching chat history:", error.response?.status, error.response?.data);
    setChatHistory([]);
  } finally {
    setIsHistoryLoading(false);
  }
};

  useEffect(() => {
    if (user?.isAuthenticated) {
      fetchChatHistory();
    } else {
      setChatHistory([]);
    }
  }, [user]);

  // Save chat to backend
  const saveChat = async (chatId, messages) => {
    if (!user?.isAuthenticated || !chatId) return;
    try {
      await axios.post(
        `${API_BASE_URL}save-chat/`,
        {
          chat_id: chatId,
          messages: messages.map((msg) => ({
            ...msg,
            files: msg.files
              ? msg.files.map((file) => ({
                  name: file.name,
                  size: file.size || 0,
                  type: file.type || "application/octet-stream",
                  url: file.url || null,
                }))
              : [],
          })),
        },
        { withCredentials: true }
      );
      fetchChatHistory(); // Refresh history
    } catch (error) {
      console.error("Error saving chat:", error);
    }
  };

  useEffect(() => {
    if (messages.length > 0 && currentChatId && user?.isAuthenticated) {
      saveChat(currentChatId, messages);
    }
  }, [messages, currentChatId]);

  // Controlled typing effect
  useEffect(() => {
    if (chunkQueue.length === 0) return;

    const timer = setInterval(() => {
      setChunkQueue((prev) => {
        if (prev.length === 0) return prev;
        const [firstChunk, ...rest] = prev;
        setTypingMessage((prev) => ({
          ...prev,
          text: prev.text + (prev.text ? " " : "") + firstChunk,
        }));
        return rest;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [chunkQueue]);

  useEffect(() => {
  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}check-auth/`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.isAuthenticated) {
        setUser({
          email: data.email,
          isAuthenticated: true,
          name: data.name,
          picture: data.picture,
        });
        setShowLoginModal(false);
        if (!currentChatId) {
          setCurrentChatId(uuidv4()); // Ensure a new chat ID after login
        }
      } else {
        setUser(null);
        setMessages([]); // Clear messages on logout
        setCurrentChatId(null); // Reset chat ID
        sessionStorage.removeItem("chatMessages"); // Clear session storage
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null); // Default to logged out on error
    } finally {
      setIsLoading(false); // Ensure loading state is updated
    }
  };

  checkAuthStatus();
}, []);

  // Handle manual login
  const handleLogin = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}login/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser({ email: data.email, isAuthenticated: true });
        setCurrentChatId(uuidv4()); // Start a new chat session
        setShowLoginModal(false); // Close the modal
      } else {
        console.error("Login failed:", response.status);
        alert("Invalid email or password. Please try again.");
      }
    } catch (error) {
      console.error("Error during login:", error);
      alert("An error occurred during login. Please try again.");
    }
  };

  // Handle Google login redirect
  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}accounts/google/login/?next=/api/check-auth/`;
  };

  useEffect(() => {
    try {
      const savedMessages = sessionStorage.getItem("chatMessages");
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        setMessages(
          parsedMessages.map((msg) => ({
            ...msg,
            files: msg.files || [],
          }))
        );
      }
    } catch (error) {
      console.error("Error loading messages from session storage:", error);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        const serializableMessages = messages.map((msg) => ({
          ...msg,
          files: msg.files
            ? msg.files.map((file) => ({
                name: file.name,
                size: file.size || 0,
                type: file.type || "application/octet-stream",
                url: file.url || null,
              }))
            : [],
        }));
        sessionStorage.setItem(
          "chatMessages",
          JSON.stringify(serializableMessages)
        );
      } catch (error) {
        console.error("Error saving messages to session storage:", error);
      }
    }
  }, [messages]);

  const handleSend = async (newMessage, files = []) => {
    if (!user?.isAuthenticated) {
      setShowLoginModal(true);
      return;
    }

    if (!currentChatId) {
      setCurrentChatId(uuidv4());
    }

    try {
      const safeMessage = {
        ...newMessage,
        files: files.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
        })),
        sender: "user",
      };
      setMessages((prev) => [...prev, safeMessage]);
      setIsProcessing(true);

      const formData = new FormData();
      if (newMessage.text) formData.append("text", newMessage.text);
      files.forEach((file) => formData.append("files", file));

      try {
        const response = await axios.post(
          `${API_BASE_URL}send-message/`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
            withCredentials: true,
          }
        );

        const { task_id } = response.data;
        const messageId = Date.now();
        setTypingMessage({ id: messageId, text: "", sender: "assistant" });

        eventSourceRef.current = new EventSource(
          `${API_BASE_URL}stream-response/${task_id}/`,
          {
            withCredentials: true,
          }
        );

        eventSourceRef.current.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.chunk) {
            setIsProcessing(false);
            setChunkQueue((prev) => [...prev, data.chunk]);
          }
          if (data.done) {
            if (data.full_text) {
              setMessages((prev) => [
                ...prev,
                {
                  text: data.full_text,
                  sender: "assistant",
                  files: response.data.files || [],
                },
              ]);
            }
            setTypingMessage(null);
            setChunkQueue([]);
            eventSourceRef.current.close();
          }
        };

        eventSourceRef.current.onerror = (error) => {
          console.error("Streaming error:", error);
          setMessages((prev) => [
            ...prev,
            {
              text: "An error occurred while streaming the response. Please try again.",
              sender: "assistant",
            },
          ]);
          setTypingMessage(null);
          setIsProcessing(false);
          setChunkQueue([]);
          eventSourceRef.current.close();
        };

        // Poll task status for document operations
        pollTaskStatus(task_id);
      } catch (error) {
        console.error("Error initiating request:", error);
        setMessages((prev) => [
          ...prev,
          { text: "An error occurred. Please try again.", sender: "assistant" },
        ]);
        setTypingMessage(null);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error in handleSend:", error);
      setMessages((prev) => [
        ...prev,
        {
          text: "An unexpected error occurred. Please try again.",
          sender: "assistant",
        },
      ]);
      setIsProcessing(false);
    }
  };

  const pollTaskStatus = async (task_id) => {
    try {
      const response = await axios.get(`${API_BASE_URL}task-status/${task_id}/`, {
        withCredentials: true,
      });

      if (response.data.status === "SUCCESS") {
        setMessages((prev) => {
          const updatedMessages = prev.filter((msg) => msg.task_id !== task_id);
          let text = "Your file is ready. Please download it below.";
          if (response.data.files && response.data.files.length === 2) {
            text = response.data.files[0].name.includes("converted")
              ? "Your PDF files are ready. Please download them below."
              : "Your files are ready. Please download them below.";
          }
          return [
            ...updatedMessages,
            {
              text,
              sender: "assistant",
              files: response.data.files
                ? response.data.files.map((file) => ({
                    name: file.name,
                    url: file.url,
                    type: file.name.endsWith(".pdf")
                      ? "application/pdf"
                      : file.name.endsWith(".docx")
                      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      : file.name.endsWith(".pptx")
                      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      : file.name.endsWith(".xlsx")
                      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      : file.name.endsWith(".jpg")
                      ? "image/jpeg"
                      : file.name.endsWith(".png")
                      ? "image/png"
                      : "application/octet-stream",
                    size: file.size,
                  }))
                : [],
            },
          ];
        });
      } else if (response.data.status === "FAILURE") {
        setMessages((prev) => [
          ...prev.filter((msg) => msg.task_id !== task_id),
          {
            text: "Processing failed. Please try again with different files or settings.",
            sender: "assistant",
          },
        ]);
      } else {
        setTimeout(() => pollTaskStatus(task_id), 1000);
      }
    } catch (error) {
      console.error("Error polling task status:", error);
      setMessages((prev) => [
        ...prev.filter((msg) => msg.task_id !== task_id),
        {
          text: "An error occurred while checking your task status. Please try again.",
          sender: "assistant",
        },
      ]);
    }
  };

  const handleDownload = async (url, filename) => {
    try {
      console.log(`Initiating download for: ${filename} from ${url}`);
      const downloadUrl = `${API_BASE_URL}download/${encodeURIComponent(filename)}`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      console.log(`Download triggered for ${filename}`);
    } catch (error) {
      console.error("Download failed:", error);
      alert(`Failed to download ${filename}: ${error.message}`);
    }
  };

  const handleDownloadAll = async (files) => {
    for (const file of files) {
      if (file.url && file.url !== "#") {
        await handleDownload(file.url, file.name);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  const startNewSession = () => {
    setMessages([]);
    sessionStorage.removeItem("chatMessages");
    setCurrentChatId(uuidv4());
  };

  const handleSelectChat = async (chatId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}chat/${chatId}/`, {
        withCredentials: true,
      });
      setMessages(response.data.messages);
      setCurrentChatId(chatId);
      setShowHistoryModal(false);
    } catch (error) {
      console.error("Error loading chat:", error.response?.status, error.response?.data);
      if (error.response?.status === 401) {
      setUser(null);
      setShowLoginModal(true);
    }
    else {
      alert("Failed to load chat session.");
     }
    }
  };

  const handleRenameChat = async (chatId, newName) => {
    try {
      await axios.post(
        `${API_BASE_URL}rename-chat/`,
        { chat_id: chatId, title: newName },
        { withCredentials: true }
      );
      fetchChatHistory();
    } catch (error) {
      console.error("Error renaming chat:", error);
      if (error.response?.status === 401) {
      setUser(null);
      setShowLoginModal(true);
    } else {
      alert("Failed to rename chat.");
     }
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (!window.confirm("Are you sure you want to delete this chat?")) return;
    try {
      await axios.delete(`${API_BASE_URL}delete-chat/${chatId}/`, {
        withCredentials: true,
      });
      fetchChatHistory();
      if (currentChatId === chatId) {
        startNewSession();
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      if (error.response?.status === 401) {
      setUser(null);
      setShowLoginModal(true);
    } else {
      alert("Failed to delete chat.");
     }
    }
  };

  const handleOpenHistory = () => {
    if (!user?.isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    fetchChatHistory().then(() => setShowHistoryModal(true));
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-[#0A1931] items-center justify-center text-white">
        <p>Loading your chat history...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-[#0A1931]">
        <Navbar
          user={user}
          setUser={setUser}
          onNewSession={startNewSession}
          setShowLoginModal={setShowLoginModal}
          onOpenHistory={handleOpenHistory}
        />
        <MessageSection
          messages={messages}
          typingMessage={typingMessage}
          isProcessing={isProcessing}
          onDownload={handleDownload}
          onDownloadAll={handleDownloadAll}
          user={user}
        />
        <Chatbar
          onSend={handleSend}
          user={user}
          setShowLoginModal={setShowLoginModal}
        />
        {showLoginModal && (
          <LoginModal
            closeModal={() => setShowLoginModal(false)}
            setUser={setUser}
            onLogin={handleLogin}
            onGoogleLogin={handleGoogleLogin}
            showMandatory={false}
          />
        )}
        {isHistoryLoading ? (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <p className="text-white">Loading chat history...</p>
          </div>
        ) : (
          <HistoryModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            chatHistory={chatHistory}
            onSelectChat={handleSelectChat}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;