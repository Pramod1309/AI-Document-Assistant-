import { useState, useEffect, useRef } from "react";
import { FaPaperclip, FaPaperPlane, FaCamera, FaTimes, FaMicrophone, FaCrop, FaMagic, FaCheck, FaRedo, FaLightbulb } from "react-icons/fa";
import FilePreviewModal from "./FilePreviewModal";
import './Chatbar.css';

const Chatbar = ({ onSend, user, setShowLoginModal }) => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [scanMode, setScanMode] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [processedImage, setProcessedImage] = useState(null);
  const [showProcessing, setShowProcessing] = useState(false);
  const [manualCorners, setManualCorners] = useState([]);
  const [isSelectingCorners, setIsSelectingCorners] = useState(false);
  const [selectedCornerIndex, setSelectedCornerIndex] = useState(null);
  const [enhancementLevel, setEnhancementLevel] = useState(2);
  const [edgeSensitivity, setEdgeSensitivity] = useState(50);
  const [opencvStatus, setOpencvStatus] = useState('loading');
  const [selectedFile, setSelectedFile] = useState(null);
  const [useFlash, setUseFlash] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const opencvRef = useRef(null);
  const recognitionRef = useRef(null);

  const fileTypeColors = {
    'pdf': 'bg-red-500',
    'doc': 'bg-blue-500',
    'docx': 'bg-blue-500',
    'ppt': 'bg-orange-500',
    'pptx': 'bg-orange-500',
    'xls': 'bg-green-500',
    'xlsx': 'bg-green-500',
    'txt': 'bg-gray-500',
    'js': 'bg-yellow-500',
    'jsx': 'bg-yellow-500',
    'zip': 'bg-purple-500',
    'rar': 'bg-purple-500',
    'default': 'bg-indigo-500'
  };

  const getFileTypeColor = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    return fileTypeColors[extension] || fileTypeColors['default'];
  };

  useEffect(() => {
    const loadOpenCV = async () => {
      try {
        await loadFromCDN();
        if (!window.cv) {
          await loadLocalOpenCV();
        }
      } catch (error) {
        console.error('OpenCV loading failed:', error);
        setOpencvStatus('error');
      }
    };

    const loadFromCDN = () => {
      return new Promise((resolve, reject) => {
        if (window.cv) {
          opencvRef.current = window.cv;
          setOpencvStatus('ready');
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
        script.async = true;
        script.onload = () => {
          if (window.cv) {
            opencvRef.current = window.cv;
            setOpencvStatus('ready');
            resolve();
          } else {
            reject(new Error('OpenCV.js not available after CDN load'));
          }
        };
        script.onerror = () => reject(new Error('Failed to load OpenCV.js from CDN'));
        document.body.appendChild(script);
      });
    };

    const loadLocalOpenCV = async () => {
      try {
        setOpencvStatus('loading-local');
        const response = await fetch('/opencv.js');
        if (!response.ok) throw new Error('Failed to fetch local OpenCV.js');
        const opencvScript = await response.text();
        const script = document.createElement('script');
        script.textContent = opencvScript;
        document.body.appendChild(script);

        await new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (window.cv) {
              clearInterval(checkInterval);
              opencvRef.current = window.cv;
              setOpencvStatus('ready');
              resolve();
            }
          }, 100);
          setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Local OpenCV.js loading timed out'));
          }, 10000);
        });
      } catch (error) {
        console.error('Local OpenCV loading failed:', error);
        setOpencvStatus('error');
        throw error;
      }
    };

    loadOpenCV();

    return () => {
      document.querySelectorAll('script[src*="opencv.js"]').forEach(script => script.remove());
    };
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = "en-US";
      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput((prevInput) => prevInput + " " + transcript);
        setIsListening(false);
      };
      recognitionInstance.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };
      recognitionInstance.onend = () => setIsListening(false);
      recognitionRef.current = recognitionInstance;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    const firstTimeVisit = sessionStorage.getItem("firstVisit");
    if (!firstTimeVisit) {
      onSend({ text: "Hi! How can I assist you today?", sender: "assistant" });
      sessionStorage.setItem("firstVisit", "true");
    }
  }, [onSend]);

  useEffect(() => {
    if (!showCameraModal || !scanMode || opencvStatus !== 'ready') {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        detectDocument();
      }
    }, 100);

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [showCameraModal, scanMode, opencvStatus, autoScan, manualCorners, edgeSensitivity]);

  const detectDocument = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (!autoScan && manualCorners.length === 4) {
      drawManualCorners(ctx);
      return;
    }

    try {
      const cv = opencvRef.current;
      if (!cv) return;

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const thresh = new cv.Mat();
      const edges = new cv.Mat();
      const hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
      cv.Canny(thresh, edges, edgeSensitivity, edgeSensitivity * 3);

      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, edges, kernel);
      cv.erode(edges, edges, kernel);

      const contours = new cv.MatVector();
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestContour = null;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        if (area < canvas.width * canvas.height * 0.2) continue;

        const perimeter = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          bestContour = approx;
        }
        approx.delete();
      }

      if (bestContour) {
        const points = bestContour.data32S;
        const corners = [
          { x: points[0], y: points[1] },
          { x: points[2], y: points[3] },
          { x: points[4], y: points[5] },
          { x: points[6], y: points[7] }
        ];
        const sortedCorners = sortCorners(corners);
        ctx.beginPath();
        ctx.moveTo(sortedCorners[0].x, sortedCorners[0].y);
        ctx.lineTo(sortedCorners[1].x, sortedCorners[1].y);
        ctx.lineTo(sortedCorners[2].x, sortedCorners[2].y);
        ctx.lineTo(sortedCorners[3].x, sortedCorners[3].y);
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "lime";
        ctx.stroke();

        sortedCorners.forEach((corner) => {
          ctx.beginPath();
          ctx.arc(corner.x, corner.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "lime";
          ctx.fill();
        });
      } else {
        ctx.font = '20px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText('No document detected. Adjust position or sensitivity.', 10, 30);
      }

      src.delete();
      gray.delete();
      blurred.delete();
      thresh.delete();
      edges.delete();
      hierarchy.delete();
      contours.delete();
      kernel.delete();
      if (bestContour) bestContour.delete();
    } catch (error) {
      console.error("OpenCV error during detection:", error);
      ctx.font = '20px Arial';
      ctx.fillStyle = 'red';
      ctx.fillText('Error detecting document. Try again.', 10, 30);
    }
  };

  const sortCorners = (corners) => {
    const center = corners.reduce(
      (acc, corner) => ({
        x: acc.x + corner.x / 4,
        y: acc.y + corner.y / 4
      }),
      { x: 0, y: 0 }
    );

    return corners.sort((a, b) => {
      if (a.y < center.y && b.y < center.y) {
        return a.x - b.x;
      } else if (a.y >= center.y && b.y >= center.y) {
        return b.x - a.x;
      }
      return a.y - b.y;
    });
  };

  const drawManualCorners = (ctx) => {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 3;
    ctx.beginPath();

    const corners = manualCorners.map(corner => ({
      x: (corner.x / 100) * ctx.canvas.width,
      y: (corner.y / 100) * ctx.canvas.height
    }));

    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    corners.forEach((corner, index) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 5, 0);
      ctx.fillStyle = selectedCornerIndex === index ? "yellow" : "blue";
      ctx.fill();
    });
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    if (!input.trim() && files.length === 0) return;

    if (!user?.isAuthenticated) {
      setShowLoginModal(true);
      return;
    }

    const userMessage = { text: input, sender: "user", files };
    onSend(userMessage, files);

    setInput("");
    setFiles([]);
  };

  const openCameraModal = async (scan = false) => {
    try {
      setShowCameraModal(true);
      setScanMode(scan);
      setProcessedImage(null);
      setManualCorners([]);
      setSelectedCornerIndex(null);
      setIsSelectingCorners(!autoScan);

      const constraints = {
        video: {
          facingMode: scan ? "environment" : "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (canvasRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
          }
        };
      }

      if (useFlash && stream.getVideoTracks()[0].getCapabilities().torch) {
        stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: true }] });
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access camera. Please check permissions.");
    }
  };

  const closeCameraModal = () => {
    setShowCameraModal(false);
    stopCamera();
    setCapturedImages([]);
    setManualCorners([]);
    setSelectedCornerIndex(null);
    setIsSelectingCorners(false);
    setProcessedImage(null);
    setShowProcessing(false);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleVideoClick = (e) => {
    if (!isSelectingCorners || !scanMode) return;

    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (selectedCornerIndex !== null) {
      const newCorners = [...manualCorners];
      newCorners[selectedCornerIndex] = { x, y };
      setManualCorners(newCorners);
      setSelectedCornerIndex(null);
    } else if (manualCorners.length < 4) {
      setManualCorners([...manualCorners, { x, y }]);
    }
  };

  const selectCorner = (index) => {
    setSelectedCornerIndex(index);
  };

  const resetManualCorners = () => {
    setManualCorners([]);
    setSelectedCornerIndex(null);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert("Camera feed not ready. Please try again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    let imageUrl;
    if (scanMode) {
      setShowProcessing(true);
      try {
        if (opencvStatus !== 'ready') throw new Error("OpenCV.js not ready");
        const processedCanvas = await processDocument(canvas);
        imageUrl = processedCanvas.toDataURL("image/png");
        setProcessedImage(imageUrl);
      } catch (error) {
        console.error("Document processing failed:", error);
        imageUrl = canvas.toDataURL("image/png");
        alert("Failed to process document. Capturing as normal photo.");
      } finally {
        setShowProcessing(false);
      }
    } else {
      imageUrl = canvas.toDataURL("image/png");
    }

    setCapturedImages((prev) => [...prev, imageUrl]);
  };

  const processDocument = async (canvas) => {
    if (!opencvRef.current) {
      throw new Error('OpenCV not available');
    }
    const cv = opencvRef.current;

    return new Promise((resolve, reject) => {
      try {
        if (canvas.width === 0 || canvas.height === 0) {
          throw new Error("Canvas has zero dimensions");
        }

        const src = cv.imread(canvas);
        const dst = new cv.Mat();
        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = canvas.width;
        outputCanvas.height = canvas.height;

        let srcPoints;
        if (!autoScan && manualCorners.length === 4) {
          srcPoints = manualCorners.flatMap((corner) => [
            (corner.x / 100) * canvas.width,
            (corner.y / 100) * canvas.height,
          ]);
        } else {
          const gray = new cv.Mat();
          const blurred = new cv.Mat();
          const thresh = new cv.Mat();
          const edges = new cv.Mat();
          const hierarchy = new cv.Mat();

          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
          cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
          cv.Canny(thresh, edges, edgeSensitivity, edgeSensitivity * 3);

          const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
          cv.dilate(edges, edges, kernel);
          cv.erode(edges, edges, kernel);

          const contours = new cv.MatVector();
          cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

          let maxArea = 0;
          let bestContour = null;
          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area < canvas.width * canvas.height * 0.2) continue;

            const perimeter = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

            if (approx.rows === 4 && area > maxArea) {
              maxArea = area;
              bestContour = approx;
            }
            approx.delete();
          }

          if (!bestContour) {
            gray.delete();
            blurred.delete();
            thresh.delete();
            edges.delete();
            hierarchy.delete();
            contours.delete();
            kernel.delete();
            src.delete();
            dst.delete();
            throw new Error("No document detected in the image");
          }

          const points = bestContour.data32S;
          srcPoints = [
            points[0], points[1],
            points[2], points[3],
            points[4], points[5],
            points[6], points[7]
          ];

          gray.delete();
          blurred.delete();
          thresh.delete();
          edges.delete();
          hierarchy.delete();
          contours.delete();
          kernel.delete();
          bestContour.delete();
        }

        const sortedPoints = sortCorners([
          { x: srcPoints[0], y: srcPoints[1] },
          { x: srcPoints[2], y: srcPoints[3] },
          { x: srcPoints[4], y: srcPoints[5] },
          { x: srcPoints[6], y: srcPoints[7] }
        ]).flatMap(p => [p.x, p.y]);

        const dstPoints = [0, 0, canvas.width, 0, canvas.width, canvas.height, 0, canvas.height];
        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, sortedPoints);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints);
        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        cv.warpPerspective(src, dst, M, new cv.Size(canvas.width, canvas.height));

        if (enhancementLevel > 1) {
          const enhanced = new cv.Mat();
          cv.cvtColor(dst, enhanced, cv.COLOR_RGBA2GRAY);
          if (enhancementLevel === 2) {
            cv.adaptiveThreshold(enhanced, enhanced, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
          } else if (enhancementLevel === 3) {
            cv.medianBlur(enhanced, enhanced, 5);
            cv.adaptiveThreshold(enhanced, enhanced, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 5);
          }
          cv.imshow(outputCanvas, enhanced);
          enhanced.delete();
        } else {
          cv.imshow(outputCanvas, dst);
        }

        srcTri.delete();
        dstTri.delete();
        M.delete();
        src.delete();
        dst.delete();

        resolve(outputCanvas);
      } catch (error) {
        reject(error);
      }
    });
  };

  const removeCapturedImage = (index) => {
    setCapturedImages(capturedImages.filter((_, i) => i !== index));
  };

  const uploadCapturedImages = () => {
    const newFiles = capturedImages.map((imageUrl, index) => {
      const blob = dataURLtoBlob(imageUrl);
      return new File([blob], `captured_${scanMode ? 'scan' : 'photo'}_${index}.png`, { type: "image/png" });
    });
    setFiles((prev) => [...prev, ...newFiles]);
    closeCameraModal();
  };

  const dataURLtoBlob = (dataURL) => {
    const byteString = atob(dataURL.split(",")[1]);
    const mimeString = dataURL.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  const toggleListening = () => {
    if (recognitionRef.current) {
      if (!isListening) {
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }
  };

  return (
    <div className="chatbar bg-[#0A1931] p-4 w-full max-w-3xl mx-auto mb-4">
      {files.length > 0 && (
        <div className="file-preview mb-4 pb-3 border-b border-gray-700 max-h-40 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {files.map((file, i) => (
              <div key={i} className="relative bg-gray-800 p-2 rounded-lg flex items-center space-x-2 min-w-0 max-w-full">
                {file.type.startsWith("image/") ? (
                  <div className="relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt="preview"
                      className="w-12 h-12 rounded-lg border object-cover cursor-pointer"
                      onClick={() => setSelectedFile(file)}
                    />
                  </div>
                ) : (
                  <div
                    className={`w-12 h-12 rounded-lg border flex flex-col items-center justify-center ${getFileTypeColor(file.name)} cursor-pointer`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <span className="text-white text-xs font-bold">
                      {file.name.split('.').pop().toUpperCase()}
                    </span>
                    <FaPaperclip className="text-white mt-1" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-gray-300">({(file.size / 1024).toFixed(2)} KB)</p>
                </div>
                <button
                  className="absolute top-1 right-1 text-red-400 hover:text-red-600 bg-gray-900 rounded-full p-1"
                  onClick={() => handleRemoveFile(i)}
                >
                  <FaTimes size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="input-section flex items-center bg-gray-800 rounded-full p-2 shadow-md">
        <label htmlFor="fileUpload" className="cursor-pointer text-white p-2 rounded-full bg-blue-600 hover:bg-blue-700">
          <FaPaperclip size={18} />
        </label>
        <input type="file" multiple className="hidden" id="fileUpload" onChange={handleFileChange} />

        <div className="relative group">
          <button
            className="text-white p-2 rounded-full bg-blue-600 hover:bg-blue-700 ml-2"
            onClick={() => openCameraModal(false)}
          >
            <FaCamera size={18} />
          </button>
          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:flex flex-col bg-gray-800 rounded-lg shadow-lg z-10">
            <button
              className="px-4 py-2 text-white hover:bg-gray-700 rounded-t-lg flex items-center text-sm"
              onClick={() => openCameraModal(false)}
            >
              <FaCamera className="mr-2" /> Normal Photo
            </button>
            <button
              className="px-4 py-2 text-white hover:bg-gray-700 rounded-b-lg flex items-center text-sm"
              onClick={() => openCameraModal(true)}
            >
              <FaCrop className="mr-2" /> Document Scan
            </button>
          </div>
        </div>

        <button
          className={`text-white p-2 rounded-full ${
            isListening ? "bg-red-500" : "bg-blue-600"
          } hover:bg-blue-700 ml-2`}
          onClick={toggleListening}
        >
          <FaMicrophone size={18} />
        </button>

        <div className="flex-1 mx-2">
          <input
            type="text"
            className="w-full bg-transparent border-none outline-none text-white px-3 py-2"
            placeholder="Type a command..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
          />
        </div>

        <button className="text-white p-2 rounded-full bg-blue-600 hover:bg-blue-700" onClick={handleSend}>
          <FaPaperPlane size={18} />
        </button>
      </div>

      {showCameraModal && (
        <div className="camera-modal fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="modal-content bg-[#0A1931] p-4 rounded-lg w-[95%] max-w-[800px] max-h-[90vh] flex flex-col">
            <button className="absolute top-2 right-2 text-white hover:text-red-500" onClick={closeCameraModal}>
              <FaTimes size={24} />
            </button>

            <h2 className="text-white text-xl mb-2 text-center">
              {scanMode ? "Document Scanner" : "Camera"}
            </h2>
            {scanMode && (
              <div className="text-sm text-center mb-2">
                {opencvStatus === 'loading' && <span className="text-yellow-400">Initializing OpenCV...</span>}
                {opencvStatus === 'loading-local' && <span className="text-yellow-400">Loading local OpenCV...</span>}
                {opencvStatus === 'ready' && <span className="text-green-400">Ready to scan!</span>}
                {opencvStatus === 'error' && <span className="text-red-400">OpenCV unavailable - basic mode</span>}
              </div>
            )}

            {scanMode ? (
              <div className="flex-1 flex flex-col sm:flex-row gap-4 overflow-hidden">
                <div className="relative flex-1 min-h-0">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full max-h-[50vh] rounded-lg object-contain bg-black"
                    onClick={handleVideoClick}
                  ></video>
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  ></canvas>

                  {showProcessing && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                      <div className="flex items-center space-x-2">
                        <div className="dot-loader"></div>
                        <div className="text-white text-lg">Processing document...</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4 w-full sm:w-[200px]">
                  <div className="controls flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          className={`px-3 py-1 rounded-full ${autoScan ? "bg-blue-600" : "bg-gray-600"} text-white text-sm flex-1`}
                          onClick={() => {
                            setAutoScan(!autoScan);
                            setIsSelectingCorners(!autoScan);
                            if (autoScan) resetManualCorners();
                          }}
                          disabled={opencvStatus !== 'ready'}
                        >
                          <FaMagic className="inline mr-1" />
                          {autoScan ? "Auto" : "Manual"}
                        </button>
                        {!autoScan && (
                          <button
                            className="px-3 py-1 rounded-full bg-gray-600 text-white text-sm flex-1"
                            onClick={resetManualCorners}
                          >
                            <FaRedo className="inline mr-1" />
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className={`px-3 py-1 rounded-full ${useFlash ? "bg-yellow-600" : "bg-gray-600"} text-white text-sm flex-1`}
                          onClick={() => setUseFlash(!useFlash)}
                          disabled={!streamRef.current?.getVideoTracks()[0]?.getCapabilities().torch}
                        >
                          <FaLightbulb className="inline mr-1" />
                          Flash {useFlash ? "On" : "Off"}
                        </button>
                        <button
                          className="px-3 py-1 rounded-full bg-gray-600 text-white text-sm flex-1"
                          onClick={capturePhoto}
                        >
                          Scan
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-white text-sm">Edge Sensitivity:</span>
                      <input
                        type="range"
                        min="30"
                        max="100"
                        value={edgeSensitivity}
                        onChange={(e) => setEdgeSensitivity(Number(e.target.value))}
                        className="w-full"
                        disabled={opencvStatus !== 'ready' || !autoScan}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-white text-sm">Enhance:</span>
                      <div className="flex gap-2">
                        {[1, 2, 3].map((level) => (
                          <button
                            key={level}
                            className={`w-8 h-8 rounded-full ${
                              enhancementLevel === level ? "bg-blue-600" : "bg-gray-600"
                            } text-white text-sm`}
                            onClick={() => setEnhancementLevel(level)}
                            disabled={opencvStatus !== 'ready'}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!autoScan && (
                      <div className="text-white text-sm text-center">
                        {manualCorners.length < 4 ? (
                          `Select ${4 - manualCorners.length} more corner(s)`
                        ) : (
                          <div className="flex items-center justify-center text-green-400">
                            <FaCheck className="mr-1" /> All corners selected
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="captured-images flex-1 overflow-y-auto p-2 bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-2 gap-2">
                      {capturedImages.map((imageUrl, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={imageUrl}
                            alt={`captured-${index}`}
                            className="w-full h-24 object-cover rounded border"
                          />
                          <button
                            className="absolute top-0 right-0 text-white bg-red-500 rounded-full p-1 hover:bg-red-600 transition-opacity opacity-0 group-hover:opacity-100"
                            onClick={() => removeCapturedImage(index)}
                          >
                            <FaTimes size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    className={`bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-400 text-sm ${
                      capturedImages.length === 0 ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    onClick={uploadCapturedImages}
                    disabled={capturedImages.length === 0}
                  >
                    Upload Scans ({capturedImages.length})
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4 flex-1 overflow-hidden">
                <div className="relative w-full">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full rounded-lg h-64"
                    onClick={handleVideoClick}
                  ></video>
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none hidden"
                  ></canvas>

                  {showProcessing && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                      <div className="flex items-center space-x-2">
                        <div className="dot-loader"></div>
                        <div className="text-white text-lg">Processing...</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full flex-1 overflow-y-auto">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-2">
                    {capturedImages.map((imageUrl, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={imageUrl}
                          alt={`captured-${index}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <button
                          className="absolute top-0 right-0 text-white bg-red-500 rounded-full p-1 hover:bg-red-600 transition-opacity opacity-0 group-hover:opacity-100"
                          onClick={() => removeCapturedImage(index)}
                        >
                          <FaTimes size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-full flex flex-col sm:flex-row justify-center gap-2 pt-2">
                  <button
                    className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 flex-1 sm:flex-none"
                    onClick={capturePhoto}
                  >
                    Capture Photo
                  </button>
                  <button
                    className={`bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-400 flex-1 sm:flex-none ${
                      capturedImages.length === 0 ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    onClick={uploadCapturedImages}
                    disabled={capturedImages.length === 0}
                  >
                    Upload Photos ({capturedImages.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedFile && (
        <FilePreviewModal file={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  );
};

export default Chatbar;