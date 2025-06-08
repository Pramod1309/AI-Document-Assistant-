import { useState } from "react";
import { FaTimes } from "react-icons/fa";
import API_BASE_URL from "../config";

const LoginModal = ({ closeModal, setUser, showMandatory = false }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match!");
      setIsLoading(false);
      return;
    }

    const url = isLogin ? `${API_BASE_URL}login/` : `${API_BASE_URL}signup/`;
    const payload = isLogin
      ? { email, password }
      : { email, password, confirm_password: confirmPassword };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok) {
        if (isLogin) {
          setUser({ 
            email, 
            isAuthenticated: true,
            name: email.split('@')[0] 
          });
          closeModal();
        } else {
          setIsLogin(true);
          setError("Signup successful! Please login.");
        }
      } else {
        setError(data.error || "Something went wrong!");
      }
    } catch (error) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const frontendUrl = "http://localhost:5173";
    const googleAuthUrl = `${API_BASE_URL}accounts/google/login/?process=login&next=${encodeURIComponent(`${API_BASE_URL}check-auth/?frontend_redirect=${encodeURIComponent(frontendUrl)}`)}`;
    window.location.href = googleAuthUrl;
  };

  return (
    <div className="fixed inset-0 flex justify-center items-center bg-black bg-opacity-60 z-50">
      <div className="bg-[#0A1931] text-white p-6 rounded-lg shadow-lg w-96 relative">
        <button
          className="absolute top-2 right-3 text-white text-xl hover:text-red-500"
          onClick={closeModal}
        >
          <FaTimes size={24} />
        </button>

        <h2 className="text-xl font-bold text-center mb-4">
          {isLogin ? "Login" : "Sign Up"}
          {showMandatory && (
            <span className="text-gray-400 text-sm block mt-1">
              * Required to continue
            </span>
          )}
        </h2>

        {error && <div className="text-red-500 text-center mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-3 py-2 border rounded bg-gray-800"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full px-3 py-2 border rounded bg-gray-800"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {!isLogin && (
            <input
              type="password"
              placeholder="Confirm Password"
              className="w-full px-3 py-2 border rounded bg-gray-800"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          )}

          <button 
            type="submit" 
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition"
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : (isLogin ? "Login" : "Sign Up")}
          </button>
        </form>

        {isLogin ? (
          <p className="mt-3 text-center">
            Don't have an account?{" "}
            <button className="text-blue-400 underline" onClick={() => setIsLogin(false)}>
              Sign Up
            </button>
          </p>
        ) : (
          <p className="mt-3 text-center">
            Already have an account?{" "}
            <button className="text-blue-400 underline" onClick={() => setIsLogin(true)}>
              Login
            </button>
          </p>
        )}
        
        <div className="relative flex items-center my-4">
          <div className="flex-grow border-t border-gray-600"></div>
          <span className="flex-shrink mx-4 text-gray-400">OR</span>
          <div className="flex-grow border-t border-gray-600"></div>
        </div>
        
        <button
          className="w-full bg-white text-gray-800 px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 transition"
          onClick={handleGoogleSignIn}
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
};

export default LoginModal;