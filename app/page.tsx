'use client';

import React, { useState, useEffect, useRef } from 'react';
import { extractTextChunksFromPdf, getPdfPageCount } from '@/lib/pdf-parser';
import { UploadCloud, CheckCircle2, ChevronDown, Download, Trash2, Key, Loader2, BookOpen, AlertCircle, FileText, ChevronRight, PlayCircle, XCircle } from 'lucide-react';

// Interfaces
interface Quiz {
  id: string;
  title: string;
  date: string;
  type: 'mcq' | 'short';
  questions: any[];
}

export default function Page() {
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(true);
  const [history, setHistory] = useState<Quiz[]>([]);
  
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');
  
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Test Mode State
  const [isTestMode, setIsTestMode] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [isTestSubmitted, setIsTestSubmitted] = useState(false);

  // Load state on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('quizgen_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setShowApiInput(false);
    }
    const savedHistory = localStorage.getItem('quizgen_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        setHistory(parsed);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('quizgen_api_key', apiKey.trim());
      setShowApiInput(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setTotalPages(null);
      try {
        const pages = await getPdfPageCount(selectedFile);
        setTotalPages(pages);
        setStartPage(1);
        setEndPage(Math.min(10, pages));
      } catch (err: any) {
         setError("Failed to load PDF metadata.");
      }
    }
  };

  const generateQuiz = async () => {
    if (!file || totalPages === null) {
      setError("Please Wait for PDF to load.");
      return;
    }
    if (!apiKey) {
      setError("Please set your Gemini API key.");
      setShowApiInput(true);
      return;
    }
    if (startPage < 1 || endPage > totalPages || startPage > endPage) {
      setError("Invalid page range.");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setError(null);

    try {
      const chunks = await extractTextChunksFromPdf(file, startPage, endPage);
      let allQuestions: any[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: chunk,
            apiKey,
            type: quizType
          })
        });

        if (!response.ok) {
           const data = await response.json();
           throw new Error(data.error || 'Failed to generate questions');
        }
        
        const data = await response.json();
        allQuestions = allQuestions.concat(data.questions);
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      if (allQuestions.length === 0) {
          throw new Error('No questions generated. The page range might be empty or too short.');
      }

      const newQuiz: Quiz = {
        id: Date.now().toString(),
        title: `${file.name.replace('.pdf', '')} (Pgs ${startPage}-${endPage})`,
        date: new Date().toISOString(),
        type: quizType,
        questions: allQuestions
      };

      const newHistory = [newQuiz, ...history];
      setHistory(newHistory);
      localStorage.setItem('quizgen_history', JSON.stringify(newHistory));
      
      setSelectedQuiz(newQuiz);
      setIsTestMode(false);
      setUserAnswers({});
      setIsTestSubmitted(false);

      setFile(null); // Reset after success
      setTotalPages(null);
      if(fileInputRef.current) fileInputRef.current.value = '';

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteQuiz = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = history.filter(q => q.id !== id);
    setHistory(newHistory);
    localStorage.setItem('quizgen_history', JSON.stringify(newHistory));
    if (selectedQuiz?.id === id) setSelectedQuiz(null);
  };

  const startTest = () => {
    setIsTestMode(true);
    setIsTestSubmitted(false);
    setUserAnswers({});
  };

  const quitTest = () => {
    setIsTestMode(false);
    setIsTestSubmitted(false);
    setUserAnswers({});
  };

  const submitTest = () => {
    setIsTestSubmitted(true);
  };

  const handleOptionSelect = (qIdx: number, val: string) => {
    if (isTestSubmitted) return;
    setUserAnswers(prev => ({...prev, [qIdx]: val}));
  };

  const calculateScore = () => {
    if (!selectedQuiz) return 0;
    let correct = 0;
    selectedQuiz.questions.forEach((q, idx) => {
      if (selectedQuiz.type === 'mcq' && userAnswers[idx] === q.correctAnswer) {
        correct++;
      }
    });
    return Math.round((correct / selectedQuiz.questions.length) * 100);
  };

  // XML Export Logic
  const escapeXml = (unsafe: string) => {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
  };

  const exportToXML = (quiz: Quiz) => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n`;
    xml += `  <title>${escapeXml(quiz.title)}</title>\n`;
    xml += `  <date>${quiz.date}</date>\n`;
    xml += `  <type>${quiz.type}</type>\n`;
    
    if (quiz.type === 'mcq') {
      quiz.questions.forEach((q: any, i: number) => {
        xml += `  <question id="${i + 1}">\n`;
        xml += `    <text>${escapeXml(q.question)}</text>\n`;
        xml += `    <options>\n`;
        if (Array.isArray(q.options)) {
          q.options.forEach((opt: string) => {
            xml += `      <option>${escapeXml(opt)}</option>\n`;
          });
        }
        xml += `    </options>\n`;
        xml += `    <correctAnswer>${escapeXml(q.correctAnswer)}</correctAnswer>\n`;
        xml += `    <explanation>${escapeXml(q.explanation)}</explanation>\n`;
        xml += `  </question>\n`;
      });
    } else {
      quiz.questions.forEach((q: any, i: number) => {
          xml += `  <question id="${i + 1}">\n`;
          xml += `    <text>${escapeXml(q.question)}</text>\n`;
          xml += `    <answer>${escapeXml(q.answer)}</answer>\n`;
          xml += `  </question>\n`;
      });
    }
    
    xml += `</quiz>`;
    
    // Trigger download
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quiz.title.replace(/\s+/g, '_')}_questions.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-8">
      
      {/* Sidebar: App Controls & History */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <BookOpen className="text-indigo-600" />
            QuizGen <span className="text-indigo-600">Local</span>
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Generate offline flashcards & tests from PDF notes using your own Gemini key.
          </p>
        </div>

        {/* API Key Modal / Section */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2 text-slate-800">
              <Key size={18} /> API Configuration
            </h3>
            {!showApiInput && (
              <button 
                onClick={() => setShowApiInput(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                Edit
              </button>
            )}
          </div>
          
          {showApiInput ? (
            <div className="space-y-3 lg:space-y-4">
              <p className="text-xs text-slate-500">Your key is stored purely locally in your browser's LocalStorage.</p>
              <input
                type="password"
                placeholder="sk-gemini-api-key..."
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                onClick={handleSaveApiKey}
                className="w-full bg-slate-900 text-white font-bold text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-slate-800 transition-all"
              >
                Save Key Locally
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
              <CheckCircle2 size={16} /> API Key is securely cached
            </div>
          )}
        </div>

        {/* Generator Controls */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-5">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <UploadCloud size={18} /> Generate New Questions
           </h3>
           
           <div 
             onClick={() => fileInputRef.current?.click()}
             className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${file ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
           >
             <input 
               type="file" 
               accept="application/pdf" 
               className="hidden" 
               ref={fileInputRef}
               onChange={handleFileChange}
             />
             <div className="bg-white p-3 rounded-full shadow-sm mb-3">
               <FileText className={file ? "text-indigo-600" : "text-slate-400"} size={24} />
             </div>
             <p className="text-sm font-bold text-slate-700 text-center">
               {file ? file.name : "Select a PDF Document"}
             </p>
             <p className="text-xs text-slate-500 mt-1">
               {file && totalPages !== null ? `${totalPages} Pages Total` : "Click to browse local files"}
             </p>
           </div>

           {file && totalPages !== null && (
             <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
               <div>
                 <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">Start Page</label>
                 <input 
                   type="number"
                   min={1}
                   max={totalPages}
                   value={startPage}
                   onChange={(e) => setStartPage(Number(e.target.value))}
                   className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-indigo-500"
                 />
               </div>
               <div>
                 <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">End Page</label>
                 <input 
                   type="number"
                   min={startPage}
                   max={totalPages}
                   value={endPage}
                   onChange={(e) => setEndPage(Number(e.target.value))}
                   className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-indigo-500"
                 />
               </div>
             </div>
           )}

           <div>
             <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-2">Question Type</label>
             <select 
               value={quizType}
               onChange={(e) => setQuizType(e.target.value as any)}
               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-500"
             >
               <option value="mcq">Multiple Choice</option>
               <option value="short">Short Answer</option>
             </select>
           </div>

           {error && (
             <div className="flex items-start gap-2 bg-rose-50 text-rose-700 p-3 rounded-xl text-xs font-medium">
               <AlertCircle size={16} className="mt-0.5 shrink-0" />
               <p>{error}</p>
             </div>
           )}

           <button
             onClick={generateQuiz}
             disabled={isGenerating || !file || totalPages === null}
             className="w-full bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest py-4 rounded-xl hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 disabled:opacity-80 disabled:cursor-not-allowed relative overflow-hidden"
           >
             {isGenerating ? (
               <>
                 <div className="absolute left-0 top-0 bottom-0 bg-indigo-500/50 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                 <div className="relative flex items-center gap-2">
                   <Loader2 className="animate-spin" size={16}/> Generating... {progress}%
                 </div>
               </>
             ) : (
               "Generate Questions"
             )}
           </button>
        </div>

        {/* History List */}
        {history.length > 0 && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-grow">
            <h3 className="font-bold text-slate-800 mb-4">Saved Library</h3>
            <div className="space-y-3">
              {history.map((q) => (
                <div 
                  key={q.id}
                  onClick={() => {
                    setSelectedQuiz(q);
                    setIsTestMode(false);
                  }}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${selectedQuiz?.id === q.id ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 truncate">{q.title}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {q.type === 'mcq' ? 'MCQ' : 'Short Answer'}
                      </span>
                      <span className="text-[10px] text-slate-400 my-auto">
                        {new Date(q.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => deleteQuiz(q.id, e)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Viewer & Test Mode */}
      <div className="w-full lg:w-2/3 h-full">
        {selectedQuiz ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-[calc(100vh-4rem)] flex flex-col">
            
            {/* Viewer Header */}
            <div className="p-6 lg:p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedQuiz.title}</h2>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500 font-medium items-center">
                  <span>{selectedQuiz.questions.length} Questions</span>
                  <span>•</span>
                  <span>{selectedQuiz.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}</span>
                  {isTestMode && isTestSubmitted && selectedQuiz.type === 'mcq' && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-700 font-bold">
                        Score: {calculateScore()}%
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!isTestMode ? (
                  <>
                    <button
                      onClick={startTest}
                      className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl hover:bg-indigo-700 transition-all"
                    >
                      <PlayCircle size={16} /> Take Test
                    </button>
                    <button
                      onClick={() => exportToXML(selectedQuiz)}
                      className="flex items-center justify-center gap-2 bg-white border border-slate-200 shadow-sm text-slate-700 font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                    >
                      <Download size={16} /> Export XML
                    </button>
                  </>
                ) : (
                  <>
                    {!isTestSubmitted && (
                       <button
                         onClick={submitTest}
                         className="flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl hover:bg-emerald-700 transition-all"
                       >
                         <CheckCircle2 size={16} /> Submit
                       </button>
                    )}
                    <button
                      onClick={quitTest}
                      className="flex items-center justify-center gap-2 bg-white border border-slate-200 shadow-sm text-slate-700 font-bold text-xs uppercase tracking-wider py-3 px-6 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                    >
                      <XCircle size={16} /> Quit Test
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Questions List */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-white">
              <div className="max-w-3xl mx-auto space-y-10">
                {selectedQuiz.questions.map((q, idx) => (
                  <div key={idx} className="group">
                    <h3 className="font-bold text-lg text-slate-800 leading-snug flex gap-3">
                      <span className="text-indigo-400">{idx + 1}.</span> {q.question}
                    </h3>
                    
                    {selectedQuiz.type === 'mcq' && q.options && (
                      <div className="mt-5 space-y-3 pl-8">
                        {q.options.map((opt: string, oIdx: number) => {
                          let optionClass = 'border-slate-100 bg-slate-50/50 text-slate-600';
                          let Icon = null;

                          if (isTestMode) {
                            if (!isTestSubmitted) {
                               const isSelected = userAnswers[idx] === opt;
                               optionClass = isSelected 
                                 ? 'border-indigo-400 bg-indigo-50/50 text-indigo-700 cursor-pointer' 
                                 : 'border-slate-100 bg-slate-50/50 text-slate-600 cursor-pointer hover:border-indigo-200';
                               if (isSelected) {
                                 Icon = <CheckCircle2 className="text-indigo-500" size={18} />;
                               }
                            } else {
                               const isCorrect = opt === q.correctAnswer;
                               const isSelected = userAnswers[idx] === opt;
                               if (isCorrect) {
                                 optionClass = 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-bold';
                                 Icon = <CheckCircle2 className="text-emerald-500" size={18} />;
                               } else if (isSelected && !isCorrect) {
                                 optionClass = 'border-rose-400 bg-rose-50/50 text-rose-800';
                                 Icon = <XCircle className="text-rose-500" size={18} />;
                               }
                            }
                          } else {
                             // Study Mode
                             const isCorrect = opt === q.correctAnswer;
                             optionClass = isCorrect 
                               ? 'border-emerald-500 bg-emerald-50/30 text-emerald-900 flex-row' 
                               : 'border-slate-100 bg-slate-50/50 text-slate-600';
                             if (isCorrect) {
                               Icon = <CheckCircle2 className="text-emerald-500" size={18} />;
                             }
                          }

                          return (
                            <div 
                              key={oIdx} 
                              onClick={() => isTestMode && handleOptionSelect(idx, opt)}
                              className={`p-4 rounded-xl border-2 transition-all flex items-center justify-between ${optionClass}`}
                            >
                              <span className="font-medium">{opt}</span>
                              {Icon && Icon}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {selectedQuiz.type === 'short' && (
                      <div className="mt-5 pl-8">
                        {isTestMode ? (
                          <div className="space-y-4">
                            <textarea
                              disabled={isTestSubmitted}
                              placeholder="Type your answer here..."
                              value={userAnswers[idx] || ''}
                              onChange={(e) => handleOptionSelect(idx, e.target.value)}
                              className="w-full p-4 bg-white border-2 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-indigo-50/30 transition-all disabled:opacity-75 disabled:bg-slate-50 resize-y min-h-[100px]"
                            />
                            {isTestSubmitted && (
                              <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-xl">
                                <span className="block text-xs uppercase font-bold text-emerald-600 mb-2">Suggested Answer</span>
                                <div className="text-emerald-900 font-medium">
                                  {q.answer}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-xl text-indigo-900 font-medium">
                            {q.answer}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedQuiz.type === 'mcq' && q.explanation && (!isTestMode || isTestSubmitted) && (
                      <div className="mt-4 pl-8">
                        <div className="inline-block bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg mb-2 uppercase tracking-wide">Explanation</div>
                        <p className="text-slate-600 text-sm leading-relaxed">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="h-12"></div> {/* Bottom Padding */}
            </div>
            
          </div>
        ) : (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
              <BookOpen className="text-indigo-300" size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No Document Selected</h3>
            <p className="text-slate-500 text-sm max-w-sm leading-relaxed mb-8">
              Select an item from your saved library on the left, or generate a new set of questions from your PDF notes.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
