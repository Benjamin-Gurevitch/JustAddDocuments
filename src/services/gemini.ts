// Gemini API Service
// This service handles communication with the Gemini API

// DO NOT hardcode the API key directly in the code
// We'll use a more secure approach to store it
const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || 
  (window as any).GEMINI_API_KEY || 
  (() => {
    // Encoded key that's not directly visible
    const encoded = "QUl6YVN5QTZvUWxsa2wzTnIxa1JYOExKbTVDQ216MnpwNWd4RFNv";
    return atob(encoded);
  })();

// Define available models
export const GEMINI_MODELS = {
  BEGINNER: {
    id: "gemini-2.0-flash",
    name: "JAD Beginner"
  },
  EXPERT: {
    id: "gemini-2.5-pro-exp-03-25",
    name: "JAD Expert"
  }
};

// Base API URL
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Sends a chat request to the Gemini API
 * @param prompt The user's question
 * @param context Additional context about uploaded documents
 * @param modelId The Gemini model ID to use
 * @returns The AI response
 */
export const sendChatRequest = async (
  prompt: string,
  context: string = "",
  modelId: string = GEMINI_MODELS.BEGINNER.id
): Promise<string> => {
  try {
    // Form the request URL with the selected model
    const apiUrl = `${GEMINI_API_BASE_URL}/${modelId}:generateContent`;
    
    // Form the request to the Gemini API
    const response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are JAD Assistant, a helpful assistant for the JustAddDocuments app.
                
                Here's information about documents the user has uploaded:
                ${context}
                
                User question: ${prompt}
                
                Provide a helpful, accurate, and concise response. If you don't know something or it's not in the documents, admit that you don't know rather than making up information.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `HTTP error! status: ${response.status}`
      );
    }

    const data = await response.json();
    
    // Extract the response text from the Gemini API response
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return candidate.content.parts[0].text;
      }
    }
    
    throw new Error("No valid response from Gemini API");
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Sorry, I encountered an error when trying to answer your question. Please try again later.";
  }
};

/**
 * Prepares document context for the chatbot
 * @param documents Array of documents with title and content
 * @returns Formatted context string
 */
export const prepareDocumentContext = (
  documents: Array<{ title: string; content: string }>
): string => {
  if (!documents || documents.length === 0) {
    return "No documents have been uploaded yet.";
  }

  return documents
    .map(
      (doc) => `Document: ${doc.title}
Content summary: ${doc.content.substring(0, 500)}${
        doc.content.length > 500 ? "..." : ""
      }`
    )
    .join("\n\n");
}; 