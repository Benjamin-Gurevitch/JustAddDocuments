import React, { useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Function to fix common syntax errors in visualization code
const fixCommonSyntaxErrors = (code: string): string => {
  let fixedCode = code;
  
  // Fix missing quotes around the explanation property
  fixedCode = fixedCode.replace(
    /explanation:\s*([^'"][^,}]*[^'"\s])\s*([,}])/g, 
    'explanation: "$1"$2'
  );
  
  // Add data-theme attribute to root elements for dark mode support
  const themeVarCode = `
  // Get the current theme for dark mode support
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  `;
  
  // Add theme detection to useEffect hooks
  fixedCode = fixedCode.replace(
    /(React\.useEffect\(\(\)\s*=>\s*{)/g,
    `$1
    // Apply current theme to visualization elements
    const elements = document.querySelectorAll('.embedded-visualization-container *');
    elements.forEach(el => {
      if (el instanceof HTMLElement) {
        el.setAttribute('data-theme', currentTheme);
      }
    });`
  );
  
  // Add theme variable to the top of the component
  if (fixedCode.includes('function App()') || fixedCode.includes('const App =')) {
    fixedCode = fixedCode.replace(
      /(function App\(\)|const App =)/,
      `${themeVarCode}$1`
    );
  }
  
  return fixedCode;
};

interface VisualizationRendererProps {
  code: string;
  description?: string;
}

export const VisualizationRenderer: React.FC<VisualizationRendererProps> = ({ code, description }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!code || !containerRef.current) return;
    
    try {
      // Clear any previous content
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      
      // Fix common syntax errors in the code
      const fixedCode = fixCommonSyntaxErrors(code);
      
      // Create a component from the code
      const Component = Function('React', `
        "use strict";
        ${fixedCode}
        return App;
      `)(React);
      
      // Render the component to the container
      const root = ReactDOM.createRoot(containerRef.current);
      root.render(React.createElement(Component));
      
      // Clear any previous errors
      setError(null);
    } catch (err) {
      console.error('Error rendering visualization:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [code]);
  
  return (
    <div className="visualization-container">
      <div className="embedded-visualization-container" ref={containerRef}>
        {error && (
          <div className="visualization-error">
            <div>
              <h3>Error rendering visualization</h3>
              <p>{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 