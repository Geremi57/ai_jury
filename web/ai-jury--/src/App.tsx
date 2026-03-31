import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Judge {
  Name: string;
  Model: string;
  Role?: string;
  Proposal?: string;
  Review?: string;
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

interface Step {
  id: string;
  title: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  detail?: string;
  timestamp?: string;
}

const App: React.FC = () => {
  const [errorText, setErrorText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debateResult, setDebateResult] = useState<DebateResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedProposals, setExpandedProposals] = useState<Record<string, boolean>>({});
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [showFinalVerdict, setShowFinalVerdict] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const toggleProposal = (judgeName: string) => {
    setExpandedProposals(prev => ({
      ...prev,
      [judgeName]: !prev[judgeName]
    }));
  };

  const toggleReview = (judgeName: string) => {
    setExpandedReviews(prev => ({
      ...prev,
      [judgeName]: !prev[judgeName]
    }));
  };

  // const addStep = (id: string, title: string, status: Step['status'] = 'pending', detail?: string) => {
  //   setSteps(prev => [...prev, { id, title, status, detail, timestamp: new Date().toLocaleTimeString() }]);
  // };

  // const updateStep = (id: string, status: Step['status'], detail?: string) => {
  //   setSteps(prev => prev.map(step => 
  //     step.id === id ? { ...step, status, detail: detail || step.detail } : step
  //   ));
  // };

  const startDebate = async () => {
    if (!errorText.trim()) {
      setErrorMessage('Please enter an error to debug');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    // Reset state
    setIsLoading(true);
    setDebateResult(null);
    setErrorMessage('');
    setExpandedProposals({});
    setExpandedReviews({});
    setSteps([]);
    setShowFinalVerdict(false);

    try {
      // Simulate real-time SSE or WebSocket would be better, but for now we'll simulate
      // In a real implementation, you'd use Server-Sent Events or WebSockets
      
      // For demo purposes, we'll simulate the steps based on what the backend returns
      // But ideally, your backend should stream these events
      
      const response = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: errorText })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(data);
      
      // After getting the data, we can build the steps from the judges
      // Since the backend doesn't stream, we'll create steps based on the result
      const newSteps: Step[] = [];
      
      // Round 1 steps - Proposals
      data.judges.forEach((judge: Judge) => {
        newSteps.push({
          id: `proposal-${judge.Name}`,
          title: `${judge.Name} submitted a proposal`,
          status: 'done',
          timestamp: new Date().toLocaleTimeString()
        });
      });
      
      // Round 2 steps - Reviews
      data.judges.forEach((judge: Judge) => {
        newSteps.push({
          id: `review-${judge.Name}`,
          title: `${judge.Name} reviewed the others`,
          status: 'done',
          timestamp: new Date().toLocaleTimeString()
        });
      });
      
      // Verdict step
      newSteps.push({
        id: 'verdict',
        title: 'Reached final verdict',
        status: 'done',
        timestamp: new Date().toLocaleTimeString()
      });
      
      setSteps(newSteps);
      setDebateResult(data);
      setShowFinalVerdict(true);
      
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const getJudgeColor = (name: string) => {
    const colors: Record<string, string> = {
      'Alice': 'text-blue-400 border-blue-500',
      'Bob': 'text-purple-400 border-purple-500',
      'Charlie': 'text-emerald-400 border-emerald-500',
      'Diana': 'text-pink-400 border-pink-500',
      'Eve': 'text-orange-400 border-orange-500'
    };
    return colors[name] || 'text-gray-400 border-gray-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '-2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-float" style={{ animationDelay: '-4s' }}></div>
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6 border border-white/20">
            <span className="text-2xl">⚖️</span>
            <span className="text-sm font-mono text-purple-300">v2.0.0</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-white via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
            THE AI JURY
          </h1>
          <p className="text-lg text-gray-300 mb-6 max-w-2xl mx-auto">
            Where AI models debate until they reach the truth
          </p>
        </div>

        {/* Input Area */}
        <div className="mb-12">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 shadow-2xl">
            <label className="block text-sm font-medium text-purple-300 mb-2">
              🔴 Enter Your Error
            </label>
            <textarea
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-black/30 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono text-sm"
              placeholder="panic: runtime error: invalid memory address or nil pointer dereference in my Go program when writing to a channel..."
            />
            
            <div className="flex items-center justify-end mt-4">
              <button
                onClick={startDebate}
                disabled={isLoading}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {!isLoading ? (
                  '⚖️ Convene The Jury'
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deliberating...
                  </span>
                )}
              </button>
            </div>
            
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {errorMessage}
              </div>
            )}
          </div>
        </div>

        {/* Real-time Progress Steps */}
        {(steps.length > 0 || isLoading) && (
          <div className="mb-8">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h3 className="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
                <span className="text-lg">⚡</span>
                Debate Progress
              </h3>
              <div className="space-y-2">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-3 text-sm">
                    <div className="w-5">
                      {step.status === 'done' && (
                        <span className="text-green-400 text-xs">✓</span>
                      )}
                      {step.status === 'loading' && (
                        <svg className="animate-spin h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      {step.status === 'pending' && (
                        <span className="text-gray-500 text-xs">○</span>
                      )}
                    </div>
                    <span className={`flex-1 ${step.status === 'done' ? 'text-gray-300' : step.status === 'loading' ? 'text-white' : 'text-gray-500'}`}>
                      {step.title}
                    </span>
                    {step.status === 'loading' && (
                      <div className="w-32 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                      </div>
                    )}
                    {step.status === 'done' && step.timestamp && (
                      <span className="text-xs text-gray-500">{step.timestamp}</span>
                    )}
                  </div>
                ))}
                {isLoading && steps.length === 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    <svg className="animate-spin h-4 w-4 text-purple-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-gray-300">Initializing debate...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Final Verdict - Displayed prominently */}
        {debateResult && showFinalVerdict && (
          <div ref={resultsRef} className="mb-8 animate-fade-in-up">
            <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm rounded-2xl p-8 border border-purple-500/40 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-3xl">⚖️</span>
                <h2 className="text-2xl font-bold text-white">Final Verdict</h2>
                <span className="ml-auto px-3 py-1 bg-green-500/20 rounded-full text-xs text-green-300">
                  {debateResult.verdict?.consensus}/{debateResult.verdict?.total_judges} agreed
                </span>
              </div>
              
              <div className="prose prose-invert max-w-none text-gray-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={MarkdownComponents}
                >
                  {(debateResult.verdict?.summary || '') + '\n\n' + (debateResult.verdict?.reasoning || '')}
                </ReactMarkdown>
              </div>
              
              <div className="mt-6 pt-4 border-t border-purple-500/30 flex flex-wrap justify-between items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <span className="text-sm">✓</span>
                  </div>
                  <div>
                    <div className="font-medium text-white">
                      {debateResult.verdict?.consensus}/{debateResult.verdict?.total_judges} judges agree
                    </div>
                    <div className="text-gray-400 text-xs">Consensus reached after debate</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xl font-bold text-purple-400">
                      {debateResult.verdict?.confidence?.toFixed(0) || 0}%
                    </div>
                    <div className="text-gray-400 text-xs">Confidence</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-gray-300">{debateResult.duration}</div>
                    <div className="text-gray-400 text-xs">Time to verdict</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Proposals (Optional - can be expanded if user wants details) */}
        {debateResult && showFinalVerdict && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-400">💡</span>
              <button
                onClick={() => {
                  const allExpanded = Object.keys(expandedProposals).length === debateResult.judges.length;
                  if (allExpanded) {
                    setExpandedProposals({});
                  } else {
                    const expanded: Record<string, boolean> = {};
                    debateResult.judges.forEach(j => { expanded[j.Name] = true; });
                    setExpandedProposals(expanded);
                  }
                }}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                {Object.keys(expandedProposals).length === debateResult.judges.length ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            
            {debateResult.judges.map((judge) => (
              <div key={judge.Name} className="bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10">
                <button
                  onClick={() => toggleProposal(judge.Name)}
                  className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${getJudgeColor(judge.Name).split(' ')[0]}`}>💡</span>
                    <div className="text-left">
                      <span className="font-medium text-white">{judge.Name}</span>
                      <span className="text-xs text-gray-400 ml-2">proposed a solution</span>
                    </div>
                  </div>
                  <span className="text-gray-400">
                    {expandedProposals[judge.Name] ? '▼' : '▶'}
                  </span>
                </button>
                
                {expandedProposals[judge.Name] && (
                  <div className="p-4 pt-0 border-t border-white/10 mt-2 animate-fade-in">
                    <div className="prose prose-invert max-w-none text-gray-300 text-sm">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MarkdownComponents}
                      >
                        {judge.Proposal || 'No proposal provided'}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Reviews Section */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-400">🔍</span>
                <button
                  onClick={() => {
                    const allExpanded = Object.keys(expandedReviews).length === debateResult.judges.length;
                    if (allExpanded) {
                      setExpandedReviews({});
                    } else {
                      const expanded: Record<string, boolean> = {};
                      debateResult.judges.forEach(j => { expanded[j.Name] = true; });
                      setExpandedReviews(expanded);
                    }
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {Object.keys(expandedReviews).length === debateResult.judges.length ? 'Collapse all reviews' : 'Expand all reviews'}
                </button>
              </div>
              
              {debateResult.judges.map((judge) => (
                <div key={`review-${judge.Name}`} className="bg-white/5 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10 mb-3">
                  <button
                    onClick={() => toggleReview(judge.Name)}
                    className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-base ${getJudgeColor(judge.Name).split(' ')[0]}`}>🔍</span>
                      <div className="text-left">
                        <span className="font-medium text-white text-sm">{judge.Name}</span>
                        <span className="text-xs text-gray-400 ml-2">reviewed the others</span>
                      </div>
                    </div>
                    <span className="text-gray-400 text-sm">
                      {expandedReviews[judge.Name] ? '▼' : '▶'}
                    </span>
                  </button>
                  
                  {expandedReviews[judge.Name] && (
                    <div className="p-3 pt-0 border-t border-white/10 mt-2 animate-fade-in">
                      <div className="prose prose-invert max-w-none text-gray-300 text-sm">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={MarkdownComponents}
                        >
                          {judge.Review || 'No review available'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Stats Footer - Minimal */}
            <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
              <div className="text-center py-2">
                <div className="text-lg font-bold text-purple-400">{debateResult.judges?.length || 0}</div>
                <div className="text-xs text-gray-500">AI Models</div>
              </div>
              <div className="text-center py-2">
                <div className="text-lg font-bold text-purple-400">{debateResult.rounds || 3}</div>
                <div className="text-xs text-gray-500">Debate Rounds</div>
              </div>
              <div className="text-center py-2">
                <div className="text-lg font-bold text-purple-400">{debateResult.duration || 'N/A'}</div>
                <div className="text-xs text-gray-500">Duration</div>
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
        .animate-fade-in-up { animation: fade-in-up 0.4s ease-out; }
        .animate-fade-in { animation: fade-in-up 0.2s ease-out; }
        .animate-spin { animation: spin 1s linear infinite; }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default App;