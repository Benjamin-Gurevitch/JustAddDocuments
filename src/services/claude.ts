interface UploadResponse {
  content: Array<{ text: string }>;
}

/**
 * Generates a complete paper with embedded visualizations
 * @param base64Data The base64-encoded document data
 * @returns Object containing the paper content and extracted visualizations
 */
export const analyzeDocument = async (base64Data: string): Promise<{
  paperContent: string;
  visualizations: Array<{id: string, description: string, code: string}>;
}> => {
  console.log('Using API Key:', process.env.REACT_APP_ANTHROPIC_API_KEY?.substring(0, 5) + '...'); 
  
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
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 8192, // Increased for both paper and visualizations
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
              text: `Generate an education explination of the pdf to instruct the user on EVERYTHING in the pdf (be exhaustive), along with all necessary visualizations, in a single response.

Format your response as follows:
Please create a comprehensive educational explanation of [SUBJECT/PDF] to help students study the material. Your response should:

1. Be EXHAUSTIVE and cover ALL material thoroughly
2. Use proper Markdown formatting throughout - ensure all content is valid markdown
3. Include helpful visualizations/quizzes where appropriate
4. MAKE A LOT OF QUIZZES PLEASE WE NEED QUIZZES. The quiz types should be dependent on the subject matter. 
5. ALSO MAKE SURE THEY DISPLAY THE ANSWERS AFTER THE USER ANSWERS THE QUIZ. MAKE SURE THEY CAN BE REPEATED MULTIPLE TIMES. 
6. Visualizations and Quizzes should be extremely frequent and helpful and visually appealing, use bubbly animations and colors.
7. Make sure the visualizations and quizzes are actually helpful and relevant to the material.  MAKE THEM VERY VEYR VERY INTERACTIVE , OR ELSE YOU WILL BE FIRED AND YOUR MOM WILL GET EXTREMELY SAD.
8. Make sure the size of the visualization/quiz is appropriate for the content it is displaying, no scrollbars. Never have them in plain text without a window.

Format your response as follows:

1. MAIN CONTENT:
   - EXTREMELY IMPORTANT: Format all content as valid markdown that will render correctly
   - MOST CRITICAL MARKDOWN RULE: Each header must be on its own line with blank lines before and after
   
   CORRECT HEADER FORMAT (do exactly this):
   \`\`\`
   # Main Title
   
   Content paragraph here...
   
   ## Section Title
   
   More content here...
   
   ### Subsection Title
   
   Even more content...
   \`\`\`
   
   INCORRECT (DO NOT DO THIS):
   \`\`\`
   # Main Title ## Section Title
   Content paragraph here...
   ### Subsection Title
   Even more content...
   \`\`\`
   
   - Each header level (# or ## or ###) MUST be on its own separate line
   - Always include a space after the # symbols
   - Always include blank lines before and after each header
   - Use bullet points and numbered lists for clarity
   - Include comprehensive explanations of all concepts
   - Reference source material appropriately
   - Format code blocks with triple backticks and language identifier (e.g. \`\`\`javascript)
   - Insert visualization or quiz placeholders exclusively where helpful, according to the subject matter and effectiveness of the visualization/quiz, using this format:
     both using the same format: {{VISUALIZATION:unique_id:brief_description}}

2. AFTER the main content, include the code for each visualization or quiz:
   - Begin each visualization or quiz with: <<VISUALIZATION:unique_id:brief_description>>
   - Include ONLY the visualization or quiz code (React/JavaScript)
   - End each visualization or quiz with: <<END_VISUALIZATION>>

 3.  VISUALIZATION OR QUIZ CODE REQUIREMENTS (CRITICAL):
   - ABSOLUTELY NO CLASS COMPONENTS. Define components STRICTLY as JavaScript functions: 'const App = () => { ... }' or 'function App() { ... }'. Example: function App() { const [count, setCount] = React.useState(0); return <div>{count}</div>; }
   - DO NOT use import or export statements - they won't work in the browser.
   - Use React hooks via the global React object (e.g., 'React.useState', 'React.useEffect').
   - For charts, use Chart.js, accessible via the global Chart object.
   - Do NOT include ReactDOM.render() calls.
   - Use ONLY standard built-in JavaScript functions (e.g., Math.pow). DO NOT use non-standard functions like Math.erf.

4. Your explanation should be comprehensive enough that a student could use it as a complete study guide for the material.


IMPORTANT:
- Each placeholder in the paper must have a corresponding visualization code block after the paper
- The unique_id must match between the placeholder and the visualization code
- Use ONLY Chart.js and React for visualizations (both are available globally)
- Visualizations and quizzes must be responsive and visually appealing
- DO NOT CHANGE the syntax or format of visualization or quiz placeholders or code blocks
- The placeholder tags in the paper ({{VISUALIZATION:id:description}}) must exactly match the 
  tags beginning the visualization or quiz code (<<VISUALIZATION:id:description>>) if you dont have this format you will be fired and your mom will get EXTREMELY sad. punctiation and everything, no non-alphabetical characters or spaces in the tags or code blocks` 
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
    const rawText = data.content[0].text;
    
    // Extract paper content and visualizations
    return extractPaperAndVisualizations(rawText);
  } catch (error) {
    throw error;
  }
};

/**
 * Renames any component function to 'App' to ensure compatibility with the rendering system
 * This handles a variety of component declaration patterns, including edge cases
 */
export const renameComponentToApp = (code: string): string => {
  // First, try to detect if the code already has a component named App
  // If it does, don't do any renaming to avoid duplicates
  if (/function\s+App\s*\(|const\s+App\s*=\s*(\([^)]*\)|)\s*=>|class\s+App\s+extends\s+React\.Component/i.test(code)) {
    console.log('Component named App already exists, skipping rename');
    return code;
  }
  
  console.log('Renaming component to App...');
  
  // Case 1: Handle regular function declarations like 'function ComponentName() {'
  // Don't match things inside comments or strings
  let functionMatched = false;
  code = code.replace(/function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g, (match, componentName) => {
    // Don't replace if it's already App or inside a comment or string (simple heuristic)
    if (componentName === 'App' || match.trim().startsWith('//') || match.trim().startsWith('*')) {
      return match;
    }
    functionMatched = true;
    console.log(`Renamed function component "${componentName}" to "App"`);
    return 'function App(';
  });
  
  // If we already renamed a function declaration, don't look for arrow functions to avoid duplicates
  if (!functionMatched) {
    // Case 2: Handle arrow functions like 'const ComponentName = () =>' or 'const ComponentName = (props) =>'
    code = code.replace(/const\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(\([^)]*\)|)\s*=>/g, (match, componentName, params) => {
      // Don't replace if it's already App or inside a comment or string
      if (componentName === 'App' || match.trim().startsWith('//') || match.trim().startsWith('*')) {
        return match;
      }
      console.log(`Renamed arrow function component "${componentName}" to "App"`);
      return `const App = ${params} =>`;
    });
  }
  
  // Case 3: Handle class components like 'class ComponentName extends React.Component'
  code = code.replace(/class\s+([A-Z][a-zA-Z0-9]*)\s+extends\s+React\.Component/g, (match, componentName) => {
    // Don't replace if it's already App or inside a comment or string
    if (componentName === 'App' || match.trim().startsWith('//') || match.trim().startsWith('*')) {
      return match;
    }
    console.log(`Renamed class component "${componentName}" to "App"`);
    return 'class App extends React.Component';
  });
  
  return code;
};

/**
 * Extracts the paper content and visualizations from the raw Claude response
 * @param rawText The raw text from Claude's response
 * @returns Object containing paper content and array of visualizations
 */
export const extractPaperAndVisualizations = (rawText: string): {
  paperContent: string;
  visualizations: Array<{id: string, description: string, code: string}>;
} => {
  // Find all visualization code blocks
  const visualizationRegex = /<<VISUALIZATION:([a-zA-Z0-9_]+):([^>]+)>>\s*([\s\S]*?)<<END_VISUALIZATION>>/g;
  const visualizations: Array<{id: string, description: string, code: string}> = [];
  
  // Extract all visualization blocks
  let match;
  while ((match = visualizationRegex.exec(rawText)) !== null) {
    // Apply the renameComponentToApp function to ensure the component is named 'App'
    const code = renameComponentToApp(match[3].trim());
    
    visualizations.push({
      id: match[1],
      description: match[2],
      code
    });
  }
  
  // Get paper content (everything before the first visualization block)
  let paperContent = rawText;
  const firstVisIndex = rawText.indexOf('<<VISUALIZATION:');
  if (firstVisIndex > -1) {
    paperContent = rawText.substring(0, firstVisIndex).trim();
  }
  
  // Clean up any trailing newlines or separators
  paperContent = paperContent.replace(/\n+$/, '');
  
  return {
    paperContent,
    visualizations
  };
};

// Keeping this function for backward compatibility
export const generateVisualizations = async (prompt: string, base64Data: string): Promise<string> => {
  console.log('Generating visualizations with Claude 3.7'); 
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
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
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
              text: prompt
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

/**
 * Extracts visualization placeholders from paper content
 * @param paper The markdown paper with visualization placeholders
 * @returns Array of visualization placeholders with IDs and descriptions
 */
export const extractVisualizationPlaceholders = (paper: string): Array<{id: string, description: string}> => {
  const placeholderRegex = /{{VISUALIZATION:([a-zA-Z0-9_]+):([^}]+)}}/g;
  const placeholders: Array<{id: string, description: string}> = [];
  
  let match;
  while ((match = placeholderRegex.exec(paper)) !== null) {
    placeholders.push({
      id: match[1],
      description: match[2]
    });
  }
  
  return placeholders;
};

/**
 * Generates a specific visualization based on its description and document content
 * @param description Description of the visualization to generate
 * @param base64Data The base64-encoded document data
 * @returns Generated React visualization code
 */
export const generateVisualizationForPlaceholder = async (
  description: string, 
  base64Data: string
): Promise<string> => {
  const visualizationPrompt = 
    `INSTRUCTIONS: Create a INTERACTIVE visualization OR INTERACTIVE QUIZ for the following description: "${description}". YOUR RESPONSE MUST CONTAIN ONLY CODE, NO TEXT.

    CRITICAL REQUIREMENTS:
    0. Number one priority: interactive.
    1. Make sure the visualization is interactive and visually appealing, use bubbly animations and colors. IT MUST BE INTERACTIVE OR ELSE YOU WILL BE FIRED AND YOUR MOM WILL GET EXTREMELY SAD.
    2. 4. MAKE A LOT OF QUIZZES PLEASE WE NEED QUIZZES. ABOUT HALF SHOULD BE QUIZZES.!!! ALSO MAKE SURE THEY DISPLAY THE ANSWERS AFTER THE USER ANSWERS THE QUIZ. MAKE SURE THEY CAN BE REPEATED MULTIPLE TIMES.
    3. You MUST name your component 'App' - NEVER use any other name. It MUST be a JavaScript function named exactly 'App'. Example: function App() { const [count, setCount] = React.useState(0); return <div>{count}</div>; }
    4. DO NOT use import or export statements - they won't work in the browser environment
    5. When using React hooks (like useState, useEffect, useRef), access them via the global React object (e.g., 'React.useState', 'React.useEffect', 'React.useRef').
    6. Chart.js is NOT a React component library. You MUST use it with a canvas element as follows:
       
       function App() {
         const canvasRef = React.useRef(null);
         
         React.useEffect(() => {
           const canvas = canvasRef.current;
           const ctx = canvas.getContext('2d');
           new Chart(ctx, { 
             type: 'bar', 
             data: { labels: [], datasets: [] }, 
             options: { responsive: true }
           });
         }, []);
         
         return <canvas ref={canvasRef} />;
       }
       
    7. Make visualizations responsive and visually appealing
    8. DO NOT include explanatory text or comments about your code
    9. DO NOT use markdown code blocks or backticks
    10. ONLY RESPOND WITH THE ACTUAL CODE - no introduction or explanation
    11. Do not include ReactDOM.render() calls
    12. Use ONLY standard built-in JavaScript functions and objects (like Math.pow, Math.sqrt). DO NOT use non-standard functions like Math.erf.
    13. Quizzes/Visualizations should be in a window.

     If you make the function not called App, it will not work. PLEASEEE DONTTTT
    Available globally: React, ReactDOM, Chart, d3`;
    
  const response = await generateVisualizations(visualizationPrompt, base64Data);
  
  // Apply the renaming function to ensure the component is named 'App'
  return renameComponentToApp(response);
}; 