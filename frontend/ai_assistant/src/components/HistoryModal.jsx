import { useState } from "react";
import { FaTimes, FaEdit, FaTrash, FaSearch } from "react-icons/fa";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import './HistoryModal.css';

const HistoryModal = ({ isOpen, onClose, chatHistory = [], onSelectChat, onRenameChat, onDeleteChat }) => {
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingChatId, setEditingChatId] = useState(null);
  const [newChatName, setNewChatName] = useState("");

  if (!isOpen) return null;

  // Filter chats based on search query
  const filteredChats = Array.isArray(chatHistory) ? chatHistory.filter((chat) => {
    const query = searchQuery.toLowerCase();
    const titleMatch = chat.title?.toLowerCase().includes(query);
    const timestampMatch = new Date(chat.timestamp).toLocaleString().toLowerCase().includes(query);
    const messageMatch = chat.messages.some((msg) =>
      msg.text.toLowerCase().includes(query)
    );
    return titleMatch || timestampMatch || messageMatch;
  }) : [];

  const handleRename = (chatId) => {
    if (editingChatId === chatId && newChatName.trim()) {
      onRenameChat(chatId, newChatName.trim());
      setEditingChatId(null);
      setNewChatName("");
    } else {
      setEditingChatId(chatId);
      setNewChatName(chatHistory.find((chat) => chat.id === chatId)?.title || "");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-[#0A1931] p-6 rounded-lg w-[90%] max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white text-xl font-bold">Chat History</h2>
          <button className="text-white hover:bg-red-600 rounded-full p-2" onClick={onClose}>
            <FaTimes size={24} />
          </button>
        </div>
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search chats by title, date, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 pl-8 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-600"
            />
            <FaSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/3 bg-gray-800 rounded-lg p-4 overflow-y-auto">
            {filteredChats.length === 0 ? (
              <p className="text-gray-400 text-center">No chats found</p>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`p-3 mb-2 rounded-lg cursor-pointer transition-all duration-200 ${
                    hoveredChatId === chat.id ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
                  }`}
                  onMouseEnter={() => setHoveredChatId(chat.id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <div className="flex justify-between items-center">
                    {editingChatId === chat.id ? (
                      <input
                        type="text"
                        value={newChatName}
                        onChange={(e) => setNewChatName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(chat.id)}
                        className="text-white bg-gray-600 rounded p-1 text-sm w-full mr-2"
                        autoFocus
                      />
                    ) : (
                      <p className="text-white text-sm font-semibold truncate">
                        {chat.title || new Date(chat.timestamp).toLocaleString()}
                      </p>
                    )}
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(chat.id);
                        }}
                        className="text-white hover:text-blue-300"
                        title={editingChatId === chat.id ? "Save" : "Rename"}
                      >
                        <FaEdit size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        className="text-white hover:text-red-600"
                        title="Delete"
                      >
                        <FaTrash size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-300 text-xs truncate">
                    {chat.messages[0]?.text || "No messages"}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="w-2/3 bg-gray-800 rounded-lg p-4 ml-4 overflow-y-auto">
            {hoveredChatId ? (
              <div className="space-y-4">
                <h3 className="text-white text-lg font-semibold">Preview</h3>
                {filteredChats
                  .find((chat) => chat.id === hoveredChatId)
                  ?.messages.slice(0, 3)
                  .map((msg, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg ${
                        msg.sender === "user" ? "bg-blue-600" : "bg-gray-700"
                      } animate-fade-in`}
                    >
                      <p className="text-xs font-semibold mb-2 text-white opacity-80">
                        {msg.sender === "user" ? "You" : "AI Assistant"}
                      </p>
                      <div className="text-sm text-white prose prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center mt-4">
                Hover over a chat to see a preview
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;