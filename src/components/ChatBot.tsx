import React, { useState, useRef, useEffect } from 'react';
import { sendChatRequest, prepareDocumentContext, GEMINI_MODELS } from '../services/gemini';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatBotProps {
  documents: Array<{ id: string; title: string; content: string }>;
}

const ChatBot: React.FC<ChatBotProps> = ({ documents }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi there! I\'m your JAD Assistant. How can I help you with your documents today?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(GEMINI_MODELS.BEGINNER.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Scroll to bottom of messages whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Focus input when chat is opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);
  
  const toggleChat = () => {
    setIsOpen(!isOpen);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };
  
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModel(e.target.value);
    
    // Add a system message indicating the model change
    const modelName = Object.values(GEMINI_MODELS).find(model => model.id === e.target.value)?.name || "JAD Assistant";
    
    setMessages(prevMessages => [
      ...prevMessages,
      {
        role: 'assistant',
        content: `Switched to ${modelName}. How can I help you?`,
        timestamp: new Date()
      }
    ]);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    try {
      // Prepare context from documents
      const context = prepareDocumentContext(documents);
      
      // Get response from Gemini API with selected model
      const response = await sendChatRequest(userMessage.content, context, selectedModel);
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prevMessages => [...prevMessages, assistantMessage]);
    } catch (error) {
      console.error('Error getting response:', error);
      
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date()
      };
      
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Format timestamp to readable time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className="chatbot-container">
      {/* Chat button */}
      <button 
        className="chat-button"
        onClick={toggleChat}
        aria-label="Chat with JAD Assistant"
      >
        {isOpen ? (
          <span className="chat-close-icon">×</span>
        ) : (
          <span className="chat-icon">💬</span>
        )}
      </button>
      
      {/* Chat panel */}
      {isOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-title">
              <span className="chat-avatar">🤖</span>
              <span>Chat with JAD</span>
            </div>
            <div className="model-selector-container">
              <select 
                className="model-selector"
                value={selectedModel}
                onChange={handleModelChange}
                aria-label="Select AI model"
              >
                <option value={GEMINI_MODELS.BEGINNER.id}>{GEMINI_MODELS.BEGINNER.name}</option>
                <option value={GEMINI_MODELS.EXPERT.id}>{GEMINI_MODELS.EXPERT.name}</option>
              </select>
            </div>
          </div>
          
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div 
                key={index} 
                className={`chat-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
              >
                <div className="message-content">
                  {message.content}
                </div>
                <div className="message-timestamp">
                  {formatTime(message.timestamp)}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="chat-message assistant-message">
                <div className="message-content typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <form className="chat-input-form" onSubmit={handleSubmit}>
            <input
              type="text"
              ref={inputRef}
              className="chat-input"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Ask a question about your documents..."
              disabled={isLoading}
            />
            <button 
              type="submit" 
              className="chat-send-button"
              disabled={!inputValue.trim() || isLoading}
            >
              <span className="send-icon">➤</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatBot; 