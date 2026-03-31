import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Judge {
  name: string;
  model: string;
  role?: string;
  proposal?: string;
  review?: string;
}

interface DebateResponse {
  error: string;
  judges: Judge[];
  verdict: {
    summary: string;
    reasoning: string;
    consensus: number;
    total_judges: number;
    confidence: number;
  };
  duration: string;
  rounds: number;
  timestamp?: string;
  consensus_reached?: boolean;
}

const App: React.FC = () => {
  const [errorText, setErrorText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debateResult, setDebateResult] = useState<DebateResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});

  const toggleReview = (judgeName: string) => {
    setExpandedReviews(prev => ({
      ...prev,
      [judgeName]: !prev[judgeName]
    }));
  };

  const startDebate = async () => {
    if (!errorText.trim()) {
      setErrorMessage('Please enter an error to debug');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    setIsLoading(true);
    setDebateResult(null);
    setErrorMessage('');
    setExpandedReviews({});

    try {
      const response = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: errorText })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setDebateResult(data);
      
      setTimeout(() => {
        document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (error) {
      console.error('Debate failed:', error);
      setErrorMessage('Failed to convene the jury. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const MarkdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
  };

  const getJudgeGradient = (name: string) => {
    const gradients: Record<string, string> = {
      'Alice': 'from-blue-500 to-blue-600',
      'Bob': 'from-purple-500 to-purple-600',
      'Charlie': 'from-emerald-500 to-emerald-600',
      'Diana': 'from-pink-500 to-pink-600',
      'Eve': 'from-orange-500 to-orange-600'
    };
    return gradients[name] || 'from-gray-500 to-gray-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '-2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-float" style={{ animationDelay: '-4s' }}></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6 border border-white/20">
            <span className="text-2xl">⚖️</span>
            <span className="text-sm font-mono text-purple-300">v2.0.0</span>
          </div>
          <h1 className="text-6xl sm:text-7xl font-bold mb-4 bg-gradient-to-r from-white via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
            THE AI JURY
          </h1>
          <p className="text-xl text-gray-300 mb-6 max-w-2xl mx-auto">
            Where AI models debate until they reach the truth
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <span className="px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/50">⚡ GPT-4o</span>
            <span className="px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/50">🎯 Claude 3.5</span>
            <span className="px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/50">🔍 Gemini Flash</span>
            <span className="px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/50">💡 Mixtral</span>
          </div>
        </div>

        {/* Input Area */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <label className="block text-sm font-medium text-purple-300 mb-2">
              🔴 Enter Your Error
            </label>
            <textarea
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
              placeholder="panic: runtime error: invalid memory address or nil pointer dereference in my Go program when writing to a channel..."
            />
            
            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-gray-400">
                💡 Try: TypeScript errors, Go panics, React hydration issues, Python exceptions...
              </div>
              <button
                onClick={startDebate}
                disabled={isLoading}
                className="group relative px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-semibold text-white hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {!isLoading ? (
                    '⚖️ Convene The Jury'
                  ) : (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Models Deliberating...
                    </>
                  )}
                </span>
              </button>
            </div>
            
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-12 text-center border border-white/10">
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 border-4 border-purple-500/30 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-purple-500 rounded-full animate-ping"></div>
                <div className="absolute inset-0 flex items-center justify-center text-4xl">⚖️</div>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">The Council Is Deliberating</h3>
              <p className="text-gray-400">3 rounds • 5 models • Cross-examination in progress</p>
              <div className="mt-6 flex justify-center gap-4 text-sm text-purple-400">
                <span className="animate-pulse">📢 Round 1: Proposals</span>
                <span>→</span>
                <span className="opacity-50">🔍 Round 2: Critique</span>
                <span>→</span>
                <span className="opacity-50">⚖️ Round 3: Verdict</span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {debateResult && !isLoading && (
          <div id="results" className="max-w-6xl mx-auto animate-fade-in-up">
            
            {/* Error Card */}
            <div className="mb-8 bg-gradient-to-r from-red-500/10 to-red-600/10 backdrop-blur-sm rounded-xl p-6 border-l-4 border-red-500">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🔴</span>
                <span className="font-semibold text-red-400">Error to Debug</span>
              </div>
              <pre className="font-mono text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto">
                {debateResult.error}
              </pre>
            </div>

            {/* Round 1: Proposals */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">📢</span>
                <h2 className="text-2xl font-bold text-white">Round 1: Initial Proposals</h2>
                <span className="text-xs px-2 py-1 bg-purple-500/20 rounded-full">
                  {debateResult.judges.length} judges
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {debateResult.judges.map((judge, idx) => (
                  <div
                    key={idx}
                    className="group bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10 hover:border-purple-500/50 transition-all hover:-translate-y-1"
                  >
                    <div className={`p-4 bg-gradient-to-r ${getJudgeGradient(judge.name)} bg-opacity-30 border-b border-white/10`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-white text-lg">{judge.name}</h3>
                          <p className="text-xs text-gray-400 font-mono mt-1">{judge.model}</p>
                        </div>
                        <span className="text-2xl opacity-50">💡</span>
                      </div>
                    </div>
                    <div className="p-5">
                      {/* FIX: Wrap ReactMarkdown in div with className */}
                      <div className="prose prose-invert max-w-none text-gray-300">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={MarkdownComponents}
                        >
                          {judge.proposal || 'No proposal provided'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Round 2: Cross-Examination with Collapsible Reviews */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">🔍</span>
                <h2 className="text-2xl font-bold text-white">Round 2: Cross-Examination</h2>
                <span className="text-xs px-2 py-1 bg-purple-500/20 rounded-full">
                  Click to review critiques
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {debateResult.judges.map((judge, idx) => (
                  <div
                    key={idx}
                    className="bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10 transition-all"
                  >
                    <button
                      onClick={() => toggleReview(judge.name)}
                      className="w-full p-4 bg-gradient-to-r from-gray-700/50 to-gray-800/50 hover:from-gray-600/50 hover:to-gray-700/50 transition-all border-b border-white/10 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🔍</span>
                        <span className="font-semibold text-white">{judge.name}</span>
                        <span className="text-xs text-gray-400 ml-2">reviews the others</span>
                      </div>
                      <span className="text-gray-400 group-hover:text-purple-400 transition-colors">
                        {expandedReviews[judge.name] ? '▼' : '▶'}
                      </span>
                    </button>
                    
                    {expandedReviews[judge.name] && (
                      <div className="p-5 animate-fade-in">
                        {/* FIX: Wrap ReactMarkdown in div with className */}
                        <div className="prose prose-invert max-w-none text-gray-300">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={MarkdownComponents}
                          >
                            {judge.review || 'No review available'}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Round 3: Final Verdict */}
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">⚖️</span>
                <h2 className="text-2xl font-bold text-white">Round 3: Final Verdict</h2>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/30 shadow-2xl">
                {/* FIX: Wrap ReactMarkdown in div with className */}
                <div className="prose prose-invert max-w-none text-gray-300 text-lg">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MarkdownComponents}
                  >
                    {(debateResult.verdict?.summary || '') + '\n\n' + (debateResult.verdict?.reasoning || '')}
                  </ReactMarkdown>
                </div>
                
                <div className="mt-6 pt-6 border-t border-purple-500/30 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                      <span className="text-2xl">✓</span>
                    </div>
                    <div>
                      <div className="font-bold text-white">
                        {debateResult.verdict?.consensus}/{debateResult.verdict?.total_judges} judges agree
                      </div>
                      <div className="text-sm text-gray-400">Consensus reached after debate</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-purple-400">
                      {debateResult.verdict?.confidence?.toFixed(0) || 0}%
                    </div>
                    <div className="text-xs text-gray-400">Confidence Score</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Footer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/10">
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-2xl font-bold text-purple-400">{debateResult.judges?.length || 0}</div>
                <div className="text-xs text-gray-400">AI Models</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-2xl font-bold text-purple-400">{debateResult.rounds || 3}</div>
                <div className="text-xs text-gray-400">Debate Rounds</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-2xl font-bold text-purple-400">{debateResult.verdict?.confidence?.toFixed(0) || 0}%</div>
                <div className="text-xs text-gray-400">Confidence</div>
              </div>
              <div className="text-center p-4 bg-white/5 rounded-xl">
                <div className="text-2xl font-bold text-purple-400">{debateResult.duration || 'N/A'}</div>
                <div className="text-xs text-gray-400">Time to Verdict</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes gradient {
          0%, 100% { background-size: 200% 200%; background-position: left center; }
          50% { background-size: 200% 200%; background-position: right center; }
        }
        
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-gradient { animation: gradient 3s ease infinite; }
        .animate-fade-in-up { animation: fade-in-up 0.6s ease-out; }
        .animate-spin { animation: spin 1s linear infinite; }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default App;