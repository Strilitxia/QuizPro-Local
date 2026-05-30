import { GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, apiKey, count, type } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
    }

    // Try to get key from request, fallback to environment variable
    const activeKey = apiKey || process.env.GEMINI_API_KEY;

    if (!activeKey) {
      return NextResponse.json({ error: 'Gemini API Key is required' }, { status: 401 });
    }

    const ai = new GoogleGenAI({ apiKey: activeKey });
    
    let schema: any;
    let prompt = `Analyze the provided text thoroughly from start to finish. Generate a highly comprehensive set of questions that covers EVERY concept, fact, and detail mentioned in the text. Do not summarize or skip any sections. Extract as many questions as necessary to ensure 100% coverage of the material.`;
    
    if (type === 'mcq') {
      prompt += ' Create multiple choice questions with 4 options and identify the correct answer.';
      schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ['question', 'options', 'correctAnswer', 'explanation']
        }
      };
    } else {
      prompt += ' Create short answer questions with a suggested correct answer.';
      schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING },
          },
          required: ['question', 'answer']
        }
      };
    }

    prompt += `\n\nTEXT CONTENT:\n${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      }
    });

    const parsedOutput = JSON.parse(response.text || '[]');
    
    return NextResponse.json({ questions: parsedOutput });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
