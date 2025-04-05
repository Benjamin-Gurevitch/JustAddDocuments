import React from 'react';
import './App.css';
import FileUpload from './components/FileUpload';

function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo-container">
            <h1>
              <span className="logo-text">Just<span className="highlight-text">Add</span>Documents</span>
            </h1>
          </div>
        </div>
      </header>

      <main className="main-content full-width">
        <div className="intro-section">
          <p className="modern-intro">Upload your document to begin</p>
        </div>
        <FileUpload />
      </main>
    </div>
  );
}

export default App;
