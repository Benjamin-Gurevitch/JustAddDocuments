import React from 'react';
import './App.css';
import FileUpload from './components/FileUpload';

function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>
            <span>📄</span>
            JAD
          </h1>
        </div>
      </header>

      <main className="main-content">
        <h2 className="section-title">Document Analysis with Claude</h2>
        <p className="section-description">
          Upload your PDF document and get an interactive analysis powered by Claude AI.
        </p>
        <FileUpload />
      </main>
    </div>
  );
}

export default App;
