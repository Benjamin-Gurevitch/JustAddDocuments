interface UploadResponse {
  content: Array<{ text: string }>;
}

export const analyzeDocument = async (base64Data: string): Promise<string> => {
  console.log('Using API Key:', process.env.REACT_APP_ANTHROPIC_API_KEY?.substring(0, 5) + '...'); // Log first 5 chars for verification
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_ANTHROPIC_API_KEY!,
        'anthropic-version': process.env.REACT_APP_ANTHROPIC_VERSION!,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: process.env.REACT_APP_ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Data
              }
            },
            {
              type: 'text',
              text: 'Please analyze this document and provide a summary of its key points. Structure your response with headings, bullet points, and code blocks where appropriate for better readability. Focus on extracting the most important information.'
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error?.message || `HTTP error! status: ${response.status}`);
    }

    const data: UploadResponse = await response.json();
    return data.content[0].text;
  } catch (error) {
    throw error;
  }
}; 