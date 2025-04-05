import React, { useState, useRef, useCallback } from 'react';
import { analyzeDocument } from '../services/claude';

interface FileUploadProps {
  maxSize?: number; // in MB
  acceptedTypes?: string[];
}

interface LearningTab {
  id: string;
  title: string;
  content: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  maxSize = 32, // Default max size is 32MB for Claude
  acceptedTypes = ['application/pdf']
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [learningTabs, setLearningTabs] = useState<LearningTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Special view for upload form
  const [view, setView] = useState<'upload' | 'content'>('upload');

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = (file: File): boolean => {
    setError('');
    
    if (file.size > maxSize * 1024 * 1024) {
      setError(`File size exceeds ${maxSize}MB limit`);
      return false;
    }

    if (!acceptedTypes.some(type => {
      if (type.includes('*')) {
        return file.type.startsWith(type.split('/*')[0]);
      }
      return file.type === type;
    })) {
      setError('Only PDF files are supported');
      return false;
    }

    return true;
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Remove the data URL prefix
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
      }
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  }, []);

  const handleBeginLearning = () => {
    if (!file) return;
    
    setLoading(true);
    setError('');

    // Use setTimeout to allow UI update before heavy work
    setTimeout(async () => {
      try {
        const base64Data = await convertToBase64(file);
        const result = await analyzeDocument(base64Data);
        
        // Create a new learning tab
        const newTabId = Date.now().toString();
        const newTab: LearningTab = {
          id: newTabId,
          title: file.name,
          content: result
        };
        
        setLearningTabs(prev => [...prev, newTab]);
        setActiveTab(newTabId);
        setView('content');
      } catch (error) {
        console.error('Upload error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred while processing the document');
      } finally {
        setLoading(false);
      }
    }, 0); // 0ms delay yields to the event loop
  };

  const formatResponse = (text: string) => {
    // Format code blocks
    const formattedText = text.replace(
      /```([a-zA-Z]*)([\s\S]*?)```/g, 
      '<div class="code-block"><div class="code-lang">$1</div><pre>$2</pre></div>'
    );
    
    // Add safety for direct rendering
    return { __html: formattedText };
  };

  const goToUpload = () => {
    setView('upload');
    setActiveTab(null);
  };

  return (
    <div className="app-layout">
      {/* Global sidebar with tabs */}
      <div className="global-sidebar">
        <button 
          className={`sidebar-upload-btn ${view === 'upload' ? 'active' : ''}`}
          onClick={goToUpload}
        >
          <span className="sidebar-icon">📄</span>
          <span className="tab-title">Upload</span>
        </button>
        
        {learningTabs.length > 0 && (
          <div className="sidebar-divider"></div>
        )}
        
        <div className="global-tabs-list">
          {learningTabs.map(tab => (
            <button
              key={tab.id}
              className={`global-tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                setView('content');
              }}
              title={tab.title}
            >
              <span className="sidebar-icon">📝</span>
              <span className="tab-title">{tab.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="main-area">
        {view === 'upload' ? (
          // Upload view
          <div className="upload-view">
            <div className="file-upload">
              <div
                className={`upload-area ${isDragging ? 'dragging' : ''} ${error ? 'error' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept={acceptedTypes.join(',')}
                  style={{ display: 'none' }}
                />
                <div className="upload-content">
                  {!file ? (
                    <>
                      <span className="upload-icon">📄</span>
                      <h3>Drop your document here</h3>
                      <p>or click to browse</p>
                      <span className="upload-info">PDF files up to {maxSize}MB</span>
                    </>
                  ) : (
                    <>
                      <span className="upload-icon">✓</span>
                      <h3>File selected</h3>
                    </>
                  )}
                </div>
              </div>
              
              {file && !error && (
                <div className="file-info">
                  <div className="file-details">
                    <div className="file-icon">📄</div>
                    <div className="file-details-content">
                      <p>{file.name}</p>
                      <span className="file-size">{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                  <button 
                    className="upload-button" 
                    onClick={handleBeginLearning}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="button-spinner" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <span className="button-icon">⚡</span>
                        <span>Begin Learning</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {error && (
              <div className="error-message">
                <div className="error-icon">⚠️</div>
                <div>{error}</div>
              </div>
            )}
          </div>
        ) : (
          // Content view
          <div className="content-view">
            {activeTab && (
              <div className="learning-results">
                <div className="learning-header">
                  <div className="learning-icon">📝</div>
                  <div className="learning-title">
                    {learningTabs.find(tab => tab.id === activeTab)?.title}
                  </div>
                </div>
                <div 
                  className="learning-content-text" 
                  dangerouslySetInnerHTML={formatResponse(learningTabs.find(tab => tab.id === activeTab)?.content || '')} 
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload; 