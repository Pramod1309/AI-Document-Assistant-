import { useState, useEffect } from "react";
import { FaHistory, FaUser, FaPlus, FaSignOutAlt } from "react-icons/fa";
import LoginModal from "./LoginModal";
import logo from "../assets/logo.jpg";

const Navbar = ({ setUser, user, onNewSession, setShowLoginModal, onOpenHistory }) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [profileImage, setProfileImage] = useState(null);

  useEffect(() => {
    // Check if user has Google profile picture
    if (user?.picture) {
      setProfileImage(user.picture);
    }
  }, [user]);

  const handleLogout = async () => {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/logout/", {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      setUser(null); // Clear user state
      setProfileImage(null); // Reset profile image
      onNewSession(); // Start a new session
      setShowProfileMenu(false); // Close the profile menu
    } else {
      const errorData = await response.json();
      console.error("Logout failed:", errorData);
      alert("Failed to logout. Please try again.");
    }
  } catch (error) {
    console.error("Logout error:", error);
    alert("An error occurred during logout. Please try again.");
  }
};

  return (
    <nav className="bg-[#0A1931] text-white p-4 flex justify-between items-center">
      <div className="flex items-center">
        <img src={logo} alt="Logo" className="w-10 h-10 rounded-full mr-3" />
        <h1 className="text-2xl font-bold">AI Assistant</h1>
      </div>

      <div className="flex items-center space-x-4">
        {user?.isAuthenticated ? (
          <>
            <div className="relative group">
              <button
                className="text-white p-2 hover:text-blue-300"
                onClick={onNewSession}
                title="New Session"
              >
                <FaPlus size={20} />
              </button>
              <span className="absolute left-1/2 transform -translate-x-1/2 bottom-[-1.5rem] text-sm text-white bg-gray-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                New Session
              </span>
            </div>
            
            <div className="relative group">
              <button
                className="text-white p-2 hover:text-blue-300 flex items-center"
                onClick={onOpenHistory}
                title="History"
              >
                <FaHistory size={20} />
              </button>
              <span className="absolute left-1/2 transform -translate-x-1/2 bottom-[-1.5rem] text-sm text-white bg-gray-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                History
              </span>
            </div>
            
            <div className="relative">
              <button
                className="flex items-center space-x-2 focus:outline-none"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                onBlur={() => setTimeout(() => setShowProfileMenu(false), 200)}
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </button>
              
              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50">
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center"
                    onClick={handleLogout}
                  >
                    <FaSignOutAlt className="mr-2" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            className="text-white p-2 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center"
            onClick={() => setShowLoginModal(true)}
            title="Login"
          >
            <FaUser size={20} />
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;