import React, { useState, useRef, useCallback } from 'react';
import { analyzeDocument } from '../services/claude';

interface FileUploadProps {
  maxSize?: number; // in MB
  acceptedTypes?: string[];
}

const FileUpload: React.FC<FileUploadProps> = ({
  maxSize = 32, // Default max size is 32MB for Claude
  acceptedTypes = ['application/pdf']
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = () => {
    if (!file) return;
    
    setLoading(true);
    setError('');
    setResponse('');

    // Use setTimeout to allow UI update before heavy work
    setTimeout(async () => {
      try {
        const base64Data = await convertToBase64(file);
        const result = await analyzeDocument(base64Data);
        setResponse(result);
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

  return (
    <>
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
        
        {file && !error && !loading && (
          <div className="file-info">
            <div className="file-details">
              <div className="file-icon">📄</div>
              <div className="file-details-content">
                <p>{file.name}</p>
                <span className="file-size">{formatFileSize(file.size)}</span>
              </div>
            </div>
            {!response && (
              <button 
                className="upload-button" 
                onClick={handleUpload}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="button-spinner" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <span>📊</span>
                    Analyze Document
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      
      {error && (
        <div className="error-message">
          <div className="error-icon">⚠️</div>
          <div>{error}</div>
        </div>
      )}
      
      {response && (
        <div className="analysis-results">
          <div className="analysis-header">
            <div className="analysis-icon">📊</div>
            Analysis Results
          </div>
          <div 
            className="analysis-content" 
            dangerouslySetInnerHTML={formatResponse(response)} 
          />
        </div>
      )}
    </>
  );
};

export default FileUpload; 