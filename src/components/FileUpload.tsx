import React, { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeDocument, generateVisualizations, extractVisualizationPlaceholders, generateVisualizationForPlaceholder, renameComponentToApp } from '../services/claude';
import '../App.css';

interface FileUploadProps {
  maxSize?: number; // in MB
  acceptedTypes?: string[];
}

interface LearningTab {
  id: string;
  title: string;
  content: string;
  visualizations: Visualization[];
  fileData?: string; // Store the base64 data of the original file
}

interface Visualization {
  id: string;
  description: string;
  code: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

// Simple function to convert markdown to HTML without disrupting visualizations
const markdownToHtml = (markdown: string): string => {
  // Basic implementation of markdown to HTML conversion
  let html = markdown;
  
  // Headers - match heading level (1-6) followed by space and text
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  
  // Lists
  // - Unordered lists
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  
  // Wrap adjacent list items in <ul> tags
  html = html.replace(/(<li>.+<\/li>)\n(?=<li>)/g, '$1');
  html = html.replace(/(<li>.+<\/li>)+/g, '<ul>$&</ul>');
  
  // - Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Wrap adjacent ordered list items in <ol> tags
  html = html.replace(/(<li>.+<\/li>)\n(?=<li>)/g, '$1');
  html = html.replace(/(<li>.+<\/li>)+/g, '<ol>$&</ol>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');
  
  // Code blocks
  html = html.replace(/```([a-zA-Z]*)([\s\S]*?)```/g, 
    '<div class="code-block"><div class="code-lang">$1</div><pre>$2</pre></div>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Paragraphs (lines that are not headers, lists, or code)
  html = html.replace(/^(?!(#|<h|<ul|<ol|<div class="code-block"|<p)).+$/gm, '<p>$&</p>');
  
  // Fix any doubled paragraph tags
  html = html.replace(/<p><p>/g, '<p>');
  html = html.replace(/<\/p><\/p>/g, '</p>');
  
  // Convert newlines to <br> within paragraphs
  html = html.replace(/(.+)\n(?!<\/?[a-z]|$)/g, '$1<br>');
  
  return html;
};

const FileUpload: React.FC<FileUploadProps> = ({
  maxSize = 32, // Default max size is 32MB for Claude
  acceptedTypes = ['application/pdf']
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [cachedFile, setCachedFile] = useState<File | null>(null); // Store the last uploaded file for visualization regeneration
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [learningTabs, setLearningTabs] = useState<LearningTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualizationContainerRef = useRef<HTMLDivElement>(null);

  // Special view for upload form or content
  const [view, setView] = useState<'upload' | 'content' | 'visualization'>('upload');

  // Add a debug mode state
  const [debugMode, setDebugMode] = useState<boolean>(false);

  // Load saved tabs from localStorage on initial render
  useEffect(() => {
    const savedTabs = localStorage.getItem('learningTabs');
    if (savedTabs) {
      try {
        const parsedTabs = JSON.parse(savedTabs);
        
        // Ensure all properties are properly set after deserialization
        const restoredTabs = parsedTabs.map((tab: any) => ({
          ...tab,
          visualizations: tab.visualizations.map((vis: any) => ({
            ...vis,
            status: vis.status || 'ready' // Ensure status is set
          }))
        }));
        
        setLearningTabs(restoredTabs);
        
        // If there are tabs, activate the most recent one
        if (restoredTabs.length > 0) {
          setActiveTab(restoredTabs[restoredTabs.length - 1].id);
          setView('content');
        }
      } catch (e) {
        console.error('Error parsing saved tabs:', e);
        // If there's an error parsing, clear the localStorage
        localStorage.removeItem('learningTabs');
      }
    }
  }, []);

  // Add a function to safely save to localStorage with size checking
  const saveToLocalStorage = (key: string, data: any) => {
    try {
      const serialized = JSON.stringify(data);
      
      // Check if the serialized data is too large
      // localStorage typically has a 5-10MB limit in most browsers
      const sizeInMB = new Blob([serialized]).size / (1024 * 1024);
      const warningSizeInMB = 4; // Warn at 4MB
      
      if (sizeInMB > warningSizeInMB) {
        console.warn(`localStorage data for ${key} is ${sizeInMB.toFixed(2)}MB, approaching browser limits`);
      }
      
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      
      // If we got a quota exceeded error, try removing the fileData
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          // Try to save again without the file data
          if (key === 'learningTabs' && Array.isArray(data)) {
            const strippedData = data.map(tab => ({
              ...tab,
              fileData: undefined // Remove file data to save space
            }));
            
            const serialized = JSON.stringify(strippedData);
            localStorage.setItem(key, serialized);
            
            console.warn('Saved tabs without file data due to quota limits');
            alert('Your browser storage limit was reached. Visualizations can no longer be regenerated without re-uploading the document.');
            
            return true;
          }
        } catch (retryError) {
          console.error('Failed to save even without file data:', retryError);
        }
      }
      
      return false;
    }
  };

  // Save tabs to localStorage whenever they change
  useEffect(() => {
    // Only save if there are tabs to save
    if (learningTabs.length > 0) {
      saveToLocalStorage('learningTabs', learningTabs);
    } else {
      // If no tabs, remove the item from localStorage
      localStorage.removeItem('learningTabs');
    }
  }, [learningTabs]);

  // Function to delete a learning tab
  const handleDeleteTab = useCallback((tabId: string, e: React.MouseEvent) => {
    // Prevent the click from bubbling up to the parent button
    e.stopPropagation();
    
    // Ask for confirmation before deleting
    if (!window.confirm('Are you sure you want to delete this tab? This action cannot be undone.')) {
      return;
    }
    
    // Filter out the tab to delete
    const updatedTabs = learningTabs.filter(tab => tab.id !== tabId);
    setLearningTabs(updatedTabs);
    
    // If the active tab is being deleted, set a new active tab
    if (activeTab === tabId) {
      if (updatedTabs.length > 0) {
        // Set the last tab as active
        setActiveTab(updatedTabs[updatedTabs.length - 1].id);
      } else {
        // If no tabs remain, go back to upload view
        setActiveTab(null);
        setView('upload');
      }
    }
  }, [learningTabs, activeTab]);

  // Store generated visualization code as components
  useEffect(() => {
    // This effect will be used to render visualization code
    if (view === 'visualization' && activeTab) {
      const tab = learningTabs.find(t => t.id === activeTab);
      if (tab) {
        tab.visualizations.forEach(visualization => {
          if (visualization.status === 'ready' && visualization.code) {
            const containerId = `vis-container-${visualization.id}`;
            const container = document.getElementById(containerId);
            
            if (container) {
              // Clear previous content
              while (container.firstChild) {
                container.removeChild(container.firstChild);
              }
              
              try {
                // Create a sandboxed iframe for rendering the React component
                const iframe = document.createElement('iframe');
                iframe.style.width = '100%';
                iframe.style.height = '500px';
                iframe.style.border = 'none';
                iframe.style.borderRadius = '8px';
                iframe.style.backgroundColor = 'white';
                iframe.title = 'Visualization';
                
                container.appendChild(iframe);
                
                // Wait for iframe to load then inject the visualization
                iframe.onload = () => {
                  if (iframe.contentDocument) {
                    // Get the raw code 
                    const rawCode = visualization.code || '';
                    
                    // Apply the renaming function to ensure the component is named 'App'
                    const transformedCode = renameComponentToApp(rawCode);
                    
                    // Create HTML content with necessary libraries
                    const htmlContent = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="utf-8">
                        <title>Visualization</title>
                        
                        <!-- Add React and visualization libraries -->
                        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
                        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js"></script>
                        <script src="https://unpkg.com/recharts@2.10.3/dist/Recharts.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
                        
                        <!-- Add react-chartjs-2 components -->
                        <script>
                          window.reactChartjs2 = {};
                          
                          // Create mock components for react-chartjs-2
                          ['Bar', 'Line', 'Pie', 'Doughnut', 'PolarArea', 'Radar', 'Scatter', 'Bubble'].forEach(chartType => {
                            window.reactChartjs2[chartType] = function(props) {
                              const canvasRef = React.useRef(null);
                              
                              React.useEffect(() => {
                                if (canvasRef.current) {
                                  const ctx = canvasRef.current.getContext('2d');
                                  new Chart(ctx, {
                                    type: chartType.toLowerCase(),
                                    data: props.data,
                                    options: props.options
                                  });
                                }
                              }, [props.data, props.options]);
                              
                              return React.createElement('canvas', {
                                ref: canvasRef,
                                style: { maxHeight: '400px' }
                              });
                            };
                          });
                        </script>
                        
                        <!-- Add Babel for JSX transpilation -->
                        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                        
                        <style>
                          body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                            margin: 0;
                            padding: 20px;
                            background-color: white;
                          }
                          #root {
                            width: 100%;
                          }
                          /* Ensure charts are responsive */
                          canvas, svg {
                            max-width: 100%;
                          }
                          .error-display {
                            color: #ef4444;
                            padding: 20px;
                            border: 1px solid #fecaca;
                            border-radius: 8px;
                            background-color: #fef2f2;
                            margin-bottom: 20px;
                          }
                        </style>
                      </head>
                      <body>
                        <div id="root"></div>
                        
                        <script>
                          // Make visualization libraries available as globals
                          window.React = React;
                          window.ReactDOM = ReactDOM;
                          window.Chart = Chart;
                          window.d3 = d3;
                          
                          // Add sample data in case the component needs it
                          window.sampleData = {
                            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                            datasets: [{
                              label: 'Sample Data',
                              data: [12, 19, 3, 5, 2, 3],
                              backgroundColor: 'rgba(75, 192, 192, 0.2)',
                              borderColor: 'rgba(75, 192, 192, 1)',
                              borderWidth: 1
                            }]
                          };
                        </script>
                        
                        <script type="text/babel" data-type="module">
                        // Make library components available in scope
                        const { Bar, Line, Pie, Doughnut, PolarArea, Radar, Scatter, Bubble } = window.reactChartjs2;
                        
                        // Define the visualization component
                        try {
                          // The user's code
                          ${transformedCode}
                          
                          const container = document.getElementById('root');
                          const root = ReactDOM.createRoot(container); 

                          // Try to render the component
                          let ComponentToRender = null;
                          
                          // DEFENSE: Explicitly check and protect against problematic components
                          // Capture global objects before and after code evaluation to find new components
                          const safeComponentSearch = () => {
                            // Explicitly check for App first - our preferred component
                            if (typeof App === 'function') {
                              // Additional safety check - make sure it's not a class constructor
                              if (App.prototype && App.prototype.isReactComponent) {
                                // It's a class component - need to make sure to use 'new'
                                return (props) => new App(props);
                              }
                              return App;
                            }
                              
                            // Check for any custom component EXCEPT "An" (which causes issues)
                            for (const key in window) {
                              if (key !== 'An' && // Explicitly exclude "An" component
                                  typeof window[key] === 'function' && 
                                  /^[A-Z]/.test(key) && 
                                  key !== 'React' && 
                                  key !== 'ReactDOM' &&
                                  key !== 'Chart') {
                                  
                                // Additional safety check for class components
                                if (window[key].prototype && window[key].prototype.isReactComponent) {
                                  // It's a class component - wrap it with proper instantiation
                                  return (props) => new window[key](props);
                                }
                                
                                return window[key];
                              }
                            }
                            
                            return null;
                          };
                          
                          ComponentToRender = safeComponentSearch();
                          
                          if (ComponentToRender) {
                            try {
                              // Create a simple wrapper component for additional safety
                              const SafeWrapper = (props) => {
                                try {
                                  const element = React.createElement(ComponentToRender, props);
                                  return React.createElement('div', { style: { width: '100%', height: '100%' } }, element);
                                } catch (error) {
                                  console.error("Error creating element:", error);
                                  return React.createElement('div', { className: 'error-display' },
                                    React.createElement('h3', null, 'Error Creating Visualization'),
                                    React.createElement('p', null, error.message),
                                    React.createElement('p', null, 'Check the browser console for more details.')
                                  );
                                }
                              };
                              
                              // Render with sample data props using createRoot
                              root.render(React.createElement(SafeWrapper, { data: window.sampleData }));
                            } catch (propsError) {
                              console.error("Error during render with props:", propsError);
                              try {
                                // Try rendering without props using createRoot
                                root.render(React.createElement('div', null, 
                                  React.createElement('p', null, 'Falling back to basic rendering...'),
                                  React.createElement(ComponentToRender)
                                ));
                              } catch (finalError) {
                                document.getElementById('root').innerHTML = 
                                  '<div class="error-display">' +
                                  '<h3 style="margin-top: 0;">Error Rendering Visualization</h3>' +
                                  '<p>' + finalError.message + '</p>' +
                                  '<p>Check the browser console for more details.</p>' +
                                  '</div>';
                              }
                            }
                          } else {
                            // If we couldn't find a suitable component, create a generic visualization
                            // using Chart.js directly as a fallback
                            const canvas = document.createElement('canvas');
                            document.getElementById('root').appendChild(canvas);
                            const ctx = canvas.getContext('2d');
                            
                            // Create a basic chart
                            new Chart(ctx, {
                              type: 'line',
                              data: {
                                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                                datasets: [{
                                  label: 'Generated Visualization',
                                  data: [12, 19, 3, 5, 2, 3],
                                  borderColor: 'rgb(75, 192, 192)',
                                  tension: 0.1
                                }]
                              },
                              options: {
                                responsive: true
                              }
                            });
                            
                            document.getElementById('root').appendChild(
                              document.createElement('div')
                            ).innerHTML = '<p style="color: #666; margin-top: 10px;">Note: Used fallback rendering because no valid React component was found.</p>';
                          }
                        } catch (error) {
                          console.error('Visualization render error:', error);
                          
                          document.getElementById('root').innerHTML = 
                            '<div class="error-display">' +
                            '<h3 style="margin-top: 0;">Error Rendering Visualization</h3>' +
                            '<p>' + error.message + '</p>' +
                            '<p>Check the browser console for more details.</p>' +
                            '</div>';
                        }
                        </script>
                      </body>
                      </html>
                    `;
                    
                    iframe.contentDocument.open();
                    iframe.contentDocument.write(htmlContent);
                    iframe.contentDocument.close();
                  }
                };
                
                iframe.src = 'about:blank';
              } catch (error) {
                console.error('Error setting up visualization:', error);
                if (visualizationContainerRef.current) {
                  visualizationContainerRef.current.innerHTML = `
                    <div class="error-message">
                      <div className="error-icon">⚠️</div>
                      <div>
                        <h3>Error Setting Up Visualization</h3>
                        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                        <p>Check the browser console for more details.</p>
                      </div>
                    </div>
                  `;
                }
              }
            }
          }
        });
      }
    }
  }, [view, activeTab, learningTabs]);

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
    
    // Cache the file for potential regeneration of visualizations
    setCachedFile(file);

    // Use setTimeout to allow UI update before heavy work
    setTimeout(async () => {
      try {
        const base64Data = await convertToBase64(file);
        
        // Generate paper and visualizations in a single API call
        const { paperContent, visualizations: extractedVisualizations } = await analyzeDocument(base64Data);
        
        // Process the extracted visualizations
        const processedVisualizations = extractedVisualizations.map(vis => ({
          ...vis,
          status: 'ready' as const
        }));
        
        // Create a new learning tab
        const newTabId = Date.now().toString();
        
        // Conditionally store file data based on size
        // Only store file data for relatively small files (under 5MB)
        // to avoid localStorage quota issues
        let fileDataToStore: string | undefined = undefined;
        
        if (file.size < 5 * 1024 * 1024) { // 5MB limit
          fileDataToStore = base64Data;
        } else {
          console.log(`File too large (${(file.size / (1024 * 1024)).toFixed(2)}MB) to cache in localStorage`);
        }
        
        const newTab: LearningTab = {
          id: newTabId,
          title: file.name,
          content: paperContent,
          visualizations: processedVisualizations,
          fileData: fileDataToStore // Store the base64 data for regeneration if under size limit
        };
        
        setLearningTabs(prev => [...prev, newTab]);
        setActiveTab(newTabId);
        setView('content');
        
        // Reset file so when returning to upload view it shows the default state
        setFile(null);
      } catch (error) {
        console.error('Upload error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred while processing the document');
      } finally {
        setLoading(false);
      }
    }, 0);
  };

  // Replace the original formatResponse function with a simplified version that preserves visualizations
  const formatResponse = (text: string, visualizations: Visualization[]) => {
    // First apply markdown formatting
    let formattedText = markdownToHtml(text);
    
    // Get the current tab
    const tab = learningTabs.find(t => t.id === activeTab);
    const fileDataAvailable = !!(file || cachedFile || (tab && tab.fileData));
    
    // Extract all visualization placeholders from the text
    const placeholderRegex = /{{VISUALIZATION:([a-zA-Z0-9_]+):([^}]+)}}/g;
    const placeholdersInText: Array<{id: string, description: string}> = [];
    
    let match;
    while ((match = placeholderRegex.exec(text)) !== null) {
      placeholdersInText.push({
        id: match[1],
        description: match[2]
      });
    }
    
    // Handle each placeholder found in the text
    placeholdersInText.forEach(placeholder => {
      const { id, description } = placeholder;
      const placeholderTag = `{{VISUALIZATION:${id}:${description}}}`;
      
      // Find if we have this visualization in our array
      const visualization = visualizations.find(v => v.id === id);
      let replacementHtml = '';
      
      if (!visualization) {
        // This is a placeholder without a corresponding visualization
        replacementHtml = `<div class="visualization-placeholder error">
          <h4>Visualization: ${description}</h4>
          <div class="placeholder-status error">
            <div class="error-icon">⚠️</div>
            <div>Visual failed to generate</div>
            <button 
              class="retry-button"
              onclick="window.dispatchEvent(new CustomEvent('regenerate-visualization', { detail: { id: '${id}', description: '${description.replace(/'/g, "\\'")}' } }))"
              ${regeneratingVisualizations[id] ? 'disabled' : ''}
              ${!fileDataAvailable ? 'disabled' : ''}
            >
              ${regeneratingVisualizations[id] ? 'Regenerating...' : 'Generate'}
            </button>
            ${!fileDataAvailable ? '<div class="file-data-warning">Document data not available. Please re-upload the document to regenerate visualizations.</div>' : ''}
          </div>
        </div>`;
      } else if (visualization.status === 'loading') {
        replacementHtml = `<div class="visualization-placeholder loading">
          <h4>Visualization: ${visualization.description}</h4>
          <div class="placeholder-status">
            <div className="spinner"></div>
            <span>Loading visualization...</span>
          </div>
        </div>`;
      } else if (visualization.status === 'error') {
        replacementHtml = `<div class="visualization-placeholder error">
          <h4>Visualization: ${visualization.description}</h4>
          <div class="placeholder-status error">
            <div className="error-icon">⚠️</div>
            <div>Error: ${visualization.error || 'Failed to load visualization'}</div>
            <button 
              class="retry-button"
              onclick="window.dispatchEvent(new CustomEvent('regenerate-visualization', { detail: { id: '${id}', description: '${description.replace(/'/g, "\\'")}' } }))"
              ${regeneratingVisualizations[id] ? 'disabled' : ''}
              ${!fileDataAvailable ? 'disabled' : ''}
            >
              ${regeneratingVisualizations[id] ? 'Regenerating...' : 'Try Again'}
            </button>
            ${!fileDataAvailable ? '<div class="file-data-warning">Document data not available. Please re-upload the document to regenerate visualizations.</div>' : ''}
          </div>
        </div>`;
      } else if (visualization.status === 'ready') {
        // Create a unique ID for this visualization container
        const visContainerId = `vis-container-${visualization.id}`;
        
        // Escape the code for safe HTML display
        const escapedCode = visualization.code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");

        // Add a regenerate button in the header
        replacementHtml = `<div class="visualization-placeholder ready">
          <div class="visualization-header">
            <h4>Visualization: ${visualization.description}</h4>
            <button 
              class="regenerate-button"
              onclick="window.dispatchEvent(new CustomEvent('regenerate-visualization', { detail: { id: '${id}', description: '${description.replace(/'/g, "\\'")}' } }))"
              ${regeneratingVisualizations[id] ? 'disabled' : ''}
              ${!fileDataAvailable ? 'disabled' : ''}
            >
              ${regeneratingVisualizations[id] ? 'Regenerating...' : 'Regenerate'}
            </button>
          </div>
          ${!fileDataAvailable ? '<div class="file-data-warning">Document data not available. Please re-upload the document to regenerate visualizations.</div>' : ''}
          <div id="${visContainerId}" class="embedded-visualization-container" data-code="${encodeURIComponent(visualization.code)}"></div>
          <details>
            <summary>Show Code</summary>
            <pre style="background-color: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 300px;">${escapedCode}</pre>
          </details>
        </div>`;
      }
      
      formattedText = formattedText.replace(placeholderTag, replacementHtml);
    });
    
    // Remove any remaining text in curly braces ({{...}}) after processing visualizations
    formattedText = formattedText.replace(/{{[^}]+}}/g, '');
    
    // Add safety for direct rendering
    return { __html: formattedText };
  };

  const goToUpload = () => {
    setView('upload');
    setActiveTab(null);
  };
  
  const goToVisualization = (visId: string) => {
    setView('visualization');
  };

  // Add a ref to track which visualizations have been manually updated
  const manuallyUpdatedVisualizations = useRef(new Set<string>());

  // This effect renders embedded visualizations after the content is displayed
  useEffect(() => {
    if (view === 'content' && activeTab) {
      const tab = learningTabs.find(t => t.id === activeTab);
      if (tab) {
        tab.visualizations.forEach(visualization => {
          if (visualization.status === 'ready' && visualization.code) {
            const containerId = `vis-container-${visualization.id}`;
            const container = document.getElementById(containerId);
            
            // Skip if this visualization was manually updated
            if (container && !manuallyUpdatedVisualizations.current.has(visualization.id)) {
              // Clear previous content
              while (container.firstChild) {
                container.removeChild(container.firstChild);
              }
              
              try {
                // Create a sandboxed iframe for rendering the React component
                const iframe = document.createElement('iframe');
                iframe.style.width = '100%';
                iframe.style.height = '400px';
                iframe.style.border = 'none';
                iframe.style.borderRadius = '8px';
                iframe.style.backgroundColor = 'white';
                iframe.title = `Visualization: ${visualization.description}`;
                
                container.appendChild(iframe);
                
                // Wait for iframe to load then inject the visualization
                iframe.onload = () => {
                  if (iframe.contentDocument) {
                    // Get the raw code 
                    const rawCode = visualization.code || '';
                    
                    // Apply the renaming function to ensure the component is named 'App'
                    const transformedCode = renameComponentToApp(rawCode);
                    
                    // Create HTML content with necessary libraries
                    const htmlContent = `
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <meta charset="utf-8">
                        <title>Visualization</title>
                        
                        <!-- Add React and visualization libraries -->
                        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
                        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js"></script>
                        <script src="https://unpkg.com/recharts@2.10.3/dist/Recharts.js"></script>
                        <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
                        
                        <!-- Add react-chartjs-2 components -->
                        <script>
                          window.reactChartjs2 = {};
                          
                          // Create mock components for react-chartjs-2
                          ['Bar', 'Line', 'Pie', 'Doughnut', 'PolarArea', 'Radar', 'Scatter', 'Bubble'].forEach(chartType => {
                            window.reactChartjs2[chartType] = function(props) {
                              const canvasRef = React.useRef(null);
                              
                              React.useEffect(() => {
                                if (canvasRef.current) {
                                  const ctx = canvasRef.current.getContext('2d');
                                  new Chart(ctx, {
                                    type: chartType.toLowerCase(),
                                    data: props.data,
                                    options: props.options
                                  });
                                }
                              }, [props.data, props.options]);
                              
                              return React.createElement('canvas', {
                                ref: canvasRef,
                                style: { maxHeight: '400px' }
                              });
                            };
                          });
                        </script>
                        
                        <!-- Add Babel for JSX transpilation -->
                        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                        
                        <style>
                          body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                            margin: 0;
                            padding: 20px;
                            background-color: white;
                          }
                          #root {
                            width: 100%;
                          }
                          /* Ensure charts are responsive */
                          canvas, svg {
                            max-width: 100%;
                          }
                          .error-display {
                            color: #ef4444;
                            padding: 20px;
                            border: 1px solid #fecaca;
                            border-radius: 8px;
                            background-color: #fef2f2;
                            margin-bottom: 20px;
                          }
                        </style>
                      </head>
                      <body>
                        <div id="root"></div>
                        
                        <script>
                          // Make visualization libraries available as globals
                          window.React = React;
                          window.ReactDOM = ReactDOM;
                          window.Chart = Chart;
                          window.d3 = d3;
                          
                          // Add sample data in case the component needs it
                          window.sampleData = {
                            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                            datasets: [{
                              label: 'Sample Data',
                              data: [12, 19, 3, 5, 2, 3],
                              backgroundColor: 'rgba(75, 192, 192, 0.2)',
                              borderColor: 'rgba(75, 192, 192, 1)',
                              borderWidth: 1
                            }]
                          };
                        </script>
                        
                        <script type="text/babel" data-type="module">
                        // Make library components available in scope
                        const { Bar, Line, Pie, Doughnut, PolarArea, Radar, Scatter, Bubble } = window.reactChartjs2;
                        
                        // Define the visualization component
                        try {
                          // The user's code
                          ${transformedCode}
                          
                          const container = document.getElementById('root');
                          const root = ReactDOM.createRoot(container); 

                          // Try to render the component
                          let ComponentToRender = null;
                          
                          // DEFENSE: Explicitly check and protect against problematic components
                          // Capture global objects before and after code evaluation to find new components
                          const safeComponentSearch = () => {
                            // Explicitly check for App first - our preferred component
                            if (typeof App === 'function') {
                              // Additional safety check - make sure it's not a class constructor
                              if (App.prototype && App.prototype.isReactComponent) {
                                // It's a class component - need to make sure to use 'new'
                                return (props) => new App(props);
                              }
                              return App;
                            }
                              
                            // Check for any custom component EXCEPT "An" (which causes issues)
                            for (const key in window) {
                              if (key !== 'An' && // Explicitly exclude "An" component
                                  typeof window[key] === 'function' && 
                                  /^[A-Z]/.test(key) && 
                                  key !== 'React' && 
                                  key !== 'ReactDOM' &&
                                  key !== 'Chart') {
                                  
                                // Additional safety check for class components
                                if (window[key].prototype && window[key].prototype.isReactComponent) {
                                  // It's a class component - wrap it with proper instantiation
                                  return (props) => new window[key](props);
                                }
                                
                                return window[key];
                              }
                            }
                            
                            return null;
                          };
                          
                          ComponentToRender = safeComponentSearch();
                          
                          if (ComponentToRender) {
                            try {
                              // Create a simple wrapper component for additional safety
                              const SafeWrapper = (props) => {
                                try {
                                  const element = React.createElement(ComponentToRender, props);
                                  return React.createElement('div', { style: { width: '100%', height: '100%' } }, element);
                                } catch (error) {
                                  console.error("Error creating element:", error);
                                  return React.createElement('div', { className: 'error-display' },
                                    React.createElement('h3', null, 'Error Creating Visualization'),
                                    React.createElement('p', null, error.message),
                                    React.createElement('p', null, 'Check the browser console for more details.')
                                  );
                                }
                              };
                              
                              // Render with sample data props using createRoot
                              root.render(React.createElement(SafeWrapper, { data: window.sampleData }));
                            } catch (propsError) {
                              console.error("Error during render with props:", propsError);
                              try {
                                // Try rendering without props using createRoot
                                root.render(React.createElement('div', null, 
                                  React.createElement('p', null, 'Falling back to basic rendering...'),
                                  React.createElement(ComponentToRender)
                                ));
                              } catch (finalError) {
                                document.getElementById('root').innerHTML = 
                                  '<div class="error-display">' +
                                  '<h3 style="margin-top: 0;">Error Rendering Visualization</h3>' +
                                  '<p>' + finalError.message + '</p>' +
                                  '<p>Check the browser console for more details.</p>' +
                                  '</div>';
                              }
                            }
                          } else {
                            // If we couldn't find a suitable component, create a generic visualization
                            // using Chart.js directly as a fallback
                            const canvas = document.createElement('canvas');
                            document.getElementById('root').appendChild(canvas);
                            const ctx = canvas.getContext('2d');
                            
                            // Create a basic chart
                            new Chart(ctx, {
                              type: 'line',
                              data: {
                                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                                datasets: [{
                                  label: 'Generated Visualization',
                                  data: [12, 19, 3, 5, 2, 3],
                                  borderColor: 'rgb(75, 192, 192)',
                                  tension: 0.1
                                }]
                              },
                              options: {
                                responsive: true
                              }
                            });
                            
                            document.getElementById('root').appendChild(
                              document.createElement('div')
                            ).innerHTML = '<p style="color: #666; margin-top: 10px;">Note: Used fallback rendering because no valid React component was found.</p>';
                          }
                        } catch (error) {
                          console.error('Visualization render error:', error);
                          
                          document.getElementById('root').innerHTML = 
                            '<div class="error-display">' +
                            '<h3 style="margin-top: 0;">Error Rendering Visualization</h3>' +
                            '<p>' + error.message + '</p>' +
                            '<p>Check the browser console for more details.</p>' +
                            '</div>';
                        }
                        </script>
                      </body>
                      </html>
                    `;
                    
                    iframe.contentDocument.open();
                    iframe.contentDocument.write(htmlContent);
                    iframe.contentDocument.close();
                  }
                };
                
                iframe.src = 'about:blank';
              } catch (error) {
                console.error('Error setting up embedded visualization:', error);
                container.innerHTML = `
                  <div class="error-message">
                    <div class="error-icon">⚠️</div>
                    <div>
                      <h3>Error Setting Up Visualization</h3>
                      <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                    </div>
                  </div>
                `;
              }
            }
          }
        });
      }

      // Reset manually updated visualizations on tab change
      return () => {
        manuallyUpdatedVisualizations.current.clear();
      };
    }
  }, [view, activeTab, learningTabs]);

  const [regeneratingVisualizations, setRegeneratingVisualizations] = useState<Record<string, boolean>>({});

  // Function to handle regeneration of a failed visualization
  const handleRegenerateVisualization = useCallback(async (visId: string, description: string) => {
    if (!activeTab) return;
    
    // Get the current tab
    const currentTab = learningTabs.find(t => t.id === activeTab);
    if (!currentTab) return;
    
    // Check for file data sources in priority order:
    // 1. Current file in memory
    // 2. Cached file in memory
    // 3. File data stored in the tab (from localStorage)
    let base64Data: string | null = null;
    
    if (file) {
      base64Data = await convertToBase64(file);
    } else if (cachedFile) {
      base64Data = await convertToBase64(cachedFile);
    } else if (currentTab.fileData) {
      base64Data = currentTab.fileData;
    }
    
    if (!base64Data) {
      console.error('No file data available for visualization regeneration');
      alert('Unable to regenerate visualization: original document data not found. Please re-upload the document.');
      return;
    }
    
    // Mark this visualization as regenerating
    setRegeneratingVisualizations(prev => ({ ...prev, [visId]: true }));
    
    try {
      // Generate a new visualization for this placeholder
      const newVisualizationCode = await generateVisualizationForPlaceholder(description, base64Data);
      
      // Create updated visualization
      const updatedVisualization = {
        id: visId,
        description,
        code: newVisualizationCode,
        status: 'ready' as const
      };
      
      // Update the specific visualization container directly
      const containerId = `vis-container-${visId}`;
      const container = document.getElementById(containerId);
      if (container) {
        renderVisualizationInContainer(container, updatedVisualization);
      }
      
      // Now update learningTabs in the background without triggering full re-renders
      // We'll use a batch update pattern to minimize render impact
      requestAnimationFrame(() => {
        // Update the visualization in the state - this will eventually persist to localStorage
        // but we've already updated the DOM directly
        setLearningTabs(prevTabs => 
          prevTabs.map(tab => {
            if (tab.id === activeTab) {
              return {
                ...tab,
                visualizations: tab.visualizations.map(v => 
                  v.id === visId ? updatedVisualization : v
                )
              };
            }
            return tab;
          })
        );
      });
    } catch (error) {
      console.error('Error regenerating visualization:', error);
      alert(`Error regenerating visualization: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRegeneratingVisualizations(prev => ({ ...prev, [visId]: false }));
    }
  }, [activeTab, file, cachedFile, learningTabs, convertToBase64]);

  // Add a helper function to render a single visualization
  const renderVisualizationInContainer = (container: HTMLElement, visualization: Visualization) => {
    // Mark this visualization as manually updated to prevent re-rendering
    manuallyUpdatedVisualizations.current.add(visualization.id);
    
    // Clear previous content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    try {
      // Create a sandboxed iframe for rendering the React component
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '400px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '8px';
      iframe.style.backgroundColor = 'white';
      iframe.title = `Visualization: ${visualization.description}`;
      
      container.appendChild(iframe);
      
      // Add visual indicator that this was regenerated
      const regeneratedIndicator = document.createElement('div');
      regeneratedIndicator.className = 'regenerated-indicator';
      regeneratedIndicator.textContent = 'Regenerated';
      regeneratedIndicator.style.position = 'absolute';
      regeneratedIndicator.style.top = '10px';
      regeneratedIndicator.style.right = '10px';
      regeneratedIndicator.style.backgroundColor = '#4f46e5';
      regeneratedIndicator.style.color = 'white';
      regeneratedIndicator.style.padding = '4px 8px';
      regeneratedIndicator.style.fontSize = '12px';
      regeneratedIndicator.style.borderRadius = '4px';
      regeneratedIndicator.style.opacity = '0.8';
      container.appendChild(regeneratedIndicator);
      
      // Fade out the indicator after 3 seconds
      setTimeout(() => {
        regeneratedIndicator.style.transition = 'opacity 1s';
        regeneratedIndicator.style.opacity = '0';
        // Remove it after fade out
        setTimeout(() => {
          if (regeneratedIndicator.parentNode === container) {
            container.removeChild(regeneratedIndicator);
          }
        }, 1000);
      }, 3000);
      
      // Wait for iframe to load then inject the visualization
      iframe.onload = () => {
        if (iframe.contentDocument) {
          // Get the raw code 
          const rawCode = visualization.code || '';
          
          // Apply the renaming function to ensure the component is named 'App'
          const transformedCode = renameComponentToApp(rawCode);
          
          // Create HTML content with necessary libraries
          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Visualization</title>
              
              <!-- Add React and visualization libraries -->
              <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
              <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
              <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
              <script src="https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js"></script>
              <script src="https://unpkg.com/recharts@2.10.3/dist/Recharts.js"></script>
              <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"></script>
              
              <!-- Add react-chartjs-2 components -->
              <script>
                window.reactChartjs2 = {};
                
                // Create mock components for react-chartjs-2
                ['Bar', 'Line', 'Pie', 'Doughnut', 'PolarArea', 'Radar', 'Scatter', 'Bubble'].forEach(chartType => {
                  window.reactChartjs2[chartType] = function(props) {
                    const canvasRef = React.useRef(null);
                    
                    React.useEffect(() => {
                      if (canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        new Chart(ctx, {
                          type: chartType.toLowerCase(),
                          data: props.data,
                          options: props.options
                        });
                      }
                    }, [props.data, props.options]);
                    
                    return React.createElement('canvas', {
                      ref: canvasRef,
                      style: { maxHeight: '400px' }
                    });
                  };
                });
              </script>
              
              <!-- Add Babel for JSX transpilation -->
              <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
              
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                  margin: 0;
                  padding: 20px;
                  background-color: white;
                }
                #root {
                  width: 100%;
                }
                /* Ensure charts are responsive */
                canvas, svg {
                  max-width: 100%;
                }
                .error-display {
                  color: #ef4444;
                  padding: 20px;
                  border: 1px solid #fecaca;
                  border-radius: 8px;
                  background-color: #fef2f2;
                  margin-bottom: 20px;
                }
              </style>
            </head>
            <body>
              <div id="root"></div>
              
              <script>
                // Make visualization libraries available as globals
                window.React = React;
                window.ReactDOM = ReactDOM;
                window.Chart = Chart;
                window.d3 = d3;
                
                // Add sample data in case the component needs it
                window.sampleData = {
                  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                  datasets: [{
                    label: 'Sample Data',
                    data: [12, 19, 3, 5, 2, 3],
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                  }]
                };
              </script>
              
              <script type="text/babel" data-type="module">
              // Make library components available in scope
              const { Bar, Line, Pie, Doughnut, PolarArea, Radar, Scatter, Bubble } = window.reactChartjs2;
              
              // Define the visualization component
              try {
                // The user's code
                ${transformedCode}
                
                const container = document.getElementById('root');
                const root = ReactDOM.createRoot(container); 

                // Try to render the component
                let ComponentToRender = null;
                
                // DEFENSE: Explicitly check and protect against problematic components
                // Capture global objects before and after code evaluation to find new components
                const safeComponentSearch = () => {
                  // Explicitly check for App first - our preferred component
                  if (typeof App === 'function') {
                    // Additional safety check - make sure it's not a class constructor
                    if (App.prototype && App.prototype.isReactComponent) {
                      // It's a class component - need to make sure to use 'new'
                      return (props) => new App(props);
                    }
                    return App;
                  }
                    
                  // Check for any custom component EXCEPT "An" (which causes issues)
                  for (const key in window) {
                    if (key !== 'An' && // Explicitly exclude "An" component
                        typeof window[key] === 'function' && 
                        /^[A-Z]/.test(key) && 
                        key !== 'React' && 
                        key !== 'ReactDOM' &&
                        key !== 'Chart') {
                        
                      // Additional safety check for class components
                      if (window[key].prototype && window[key].prototype.isReactComponent) {
                        // It's a class component - wrap it with proper instantiation
                        return (props) => new window[key](props);
                      }
                      
                      return window[key];
                    }
                  }
                  
                  return null;
                };
                
                ComponentToRender = safeComponentSearch();
                
                if (ComponentToRender) {
                  try {
                    // Create a simple wrapper component for additional safety
                    const SafeWrapper = (props) => {
                      try {
                        const element = React.createElement(ComponentToRender, props);
                        return React.createElement('div', { style: { width: '100%', height: '100%' } }, element);
                      } catch (error) {
                        console.error("Error creating element:", error);
                        return React.createElement('div', { className: 'error-display' },
                          React.createElement('h3', null, 'Error Creating Visualization'),
                          React.createElement('p', null, error.message),
                          React.createElement('p', null, 'Check the browser console for more details.')
                        );
                      }
                    };
                    
                    // Render with sample data props using createRoot
                    root.render(React.createElement(SafeWrapper, { data: window.sampleData }));
                  } catch (propsError) {
                    console.error("Error during render with props:", propsError);
                    try {
                      // Try rendering without props using createRoot
                      root.render(React.createElement('div', null, 
                        React.createElement('p', null, 'Falling back to basic rendering...'),
                        React.createElement(ComponentToRender)
                      ));
                    } catch (finalError) {
                      document.getElementById('root').innerHTML = 
                        '<div class="error-display">' +
                        '<h3 style="margin-top: 0;">Error Rendering Visualization</h3>' +
                        '<p>' + finalError.message + '</p>' +
                        '<p>Check the browser console for more details.</p>' +
                        '</div>';
                    }
                  }
                } else {
                  // If we couldn't find a suitable component, create a generic visualization
                  // using Chart.js directly as a fallback
                  const canvas = document.createElement('canvas');
                  document.getElementById('root').appendChild(canvas);
                  const ctx = canvas.getContext('2d');
                  
                  // Create a basic chart
                  new Chart(ctx, {
                    type: 'line',
                    data: {
                      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                      datasets: [{
                        label: 'Generated Visualization',
                        data: [12, 19, 3, 5, 2, 3],
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1
                      }]
                    },
                    options: {
                      responsive: true
                    }
                  });
                  
                  document.getElementById('root').appendChild(
                    document.createElement('div')
                  ).innerHTML = '<p style="color: #666; margin-top: 10px;">Note: Used fallback rendering because no valid React component was found.</p>';
                }
              } catch (error) {
                console.error('Visualization render error:', error);
                
                document.getElementById('root').innerHTML = 
                  '<div class="error-display">' +
                  '<h3 style="margin-top: 0;">Error Rendering Visualization</h3>' +
                  '<p>' + error.message + '</p>' +
                  '<p>Check the browser console for more details.</p>' +
                  '</div>';
              }
              </script>
            </body>
            </html>
          `;
          
          iframe.contentDocument.open();
          iframe.contentDocument.write(htmlContent);
          iframe.contentDocument.close();
        }
      };
      
      iframe.src = 'about:blank';
    } catch (error) {
      console.error('Error setting up embedded visualization:', error);
      container.innerHTML = `
        <div class="error-message">
          <div class="error-icon">⚠️</div>
          <div>
            <h3>Error Setting Up Visualization</h3>
            <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      `;
    }
  }

  // Add listener for visualization regeneration events
  useEffect(() => {
    const handleRegenerateEvent = (event: CustomEvent) => {
      const { id, description } = event.detail;
      handleRegenerateVisualization(id, description);
    };

    // Add the event listener
    window.addEventListener('regenerate-visualization', handleRegenerateEvent as EventListener);

    // Clean up
    return () => {
      window.removeEventListener('regenerate-visualization', handleRegenerateEvent as EventListener);
    };
  }, [handleRegenerateVisualization]);

  // Function to handle clearing all tabs
  const handleClearAllTabs = useCallback(() => {
    if (learningTabs.length === 0) return;
    
    if (window.confirm('Are you sure you want to delete ALL tabs? This action cannot be undone.')) {
      // Clear all tabs
      setLearningTabs([]);
      setActiveTab(null);
      setView('upload');
      
      // Clear localStorage
      localStorage.removeItem('learningTabs');
    }
  }, [learningTabs]);

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
          <>
            <div className="sidebar-divider"></div>
            <div className="sidebar-header">
              <span>Your Lessons</span>
              <button 
                className="clear-all-btn" 
                onClick={handleClearAllTabs}
                title="Clear All Lessons"
              >
                Clear All
              </button>
            </div>
          </>
        )}
        
        <div className="global-tabs-list">
          {learningTabs.map(tab => (
            <React.Fragment key={tab.id}>
              <button
                className={`global-tab-button ${activeTab === tab.id && view === 'content' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setView('content');
                }}
                title={tab.title}
              >
                <span className="sidebar-icon">📝</span>
                <span className="tab-title">{tab.title}</span>
                <button 
                  className="delete-tab-btn"
                  onClick={(e) => handleDeleteTab(tab.id, e)} 
                  title="Delete tab"
                >
                  ×
                </button>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="main-area">
        {view === 'upload' ? (
          // Upload view
          <div className="upload-view">
            <div className="upload-intro">
              <p className="modern-intro">Upload your document to begin</p>
            </div>
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
        ) : view === 'content' ? (
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
                  dangerouslySetInnerHTML={formatResponse(
                    learningTabs.find(tab => tab.id === activeTab)?.content || '',
                    learningTabs.find(tab => tab.id === activeTab)?.visualizations || []
                  )} 
                />
              </div>
            )}
          </div>
        ) : (
          // Visualization view
          <div className="visualization-view">
            {activeTab && (
              <div className="visualization-container">
                <div className="visualization-header">
                  <div className="visualization-icon">📊</div>
                  <div className="visualization-title">
                    {learningTabs.find(tab => tab.id === activeTab)?.title}
                  </div>
                  
                  <div className="visualization-controls">
                    {/* Button to go back to document */}
                    <button 
                      className="back-to-document-button"
                      onClick={() => {
                        const tab = learningTabs.find(t => t.id === activeTab);
                        if (tab) {
                          setActiveTab(null);
                          setView('content');
                        }
                      }}
                    >
                      <span className="button-icon">📝</span>
                      <span>Back to Document</span>
                    </button>
                  </div>
                </div>
                
                {/* Container for rendered visualizations */}
                <div className="visualization-content">
                  {(() => {
                    const tab = learningTabs.find(t => t.id === activeTab);
                    if (tab) {
                      return (
                        <>
                          {tab.visualizations.map(visualization => (
                            <div 
                              key={visualization.id}
                              className="visualization-item"
                            >
                              <div className="visualization-header">
                                <div className="visualization-icon">📊</div>
                                <div className="visualization-title">
                                  {visualization.description}
                                </div>
                              </div>
                              <div className="visualization-content">
                                {(() => {
                                  if (visualization.status === 'loading') {
                                    return (
                                      <div className="visualization-loading">
                                        <div className="spinner"></div>
                                        <p>Loading visualization...</p>
                                      </div>
                                    );
                                  } else if (visualization.status === 'error') {
                                    return (
                                      <div className="visualization-error">
                                        <div className="error-icon">⚠️</div>
                                        <div>
                                          <h3>Visualization Error</h3>
                                          <p>{visualization.error || 'Failed to load visualization'}</p>
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div 
                                        ref={visualizationContainerRef}
                                        id={`visualization-container-${visualization.id}`}
                                        className="embedded-visualization-container"
                                        data-code={encodeURIComponent(visualization.code)}
                                      />
                                    );
                                  }
                                })()}
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload; 