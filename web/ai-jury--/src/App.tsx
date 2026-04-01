import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ─── Types (unchanged — stream contract preserved) ───────────────────────────

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

interface StreamEvent {
  type: string;
  step: string;
  judge?: string;
  message: string;
  data?: any;
  status: string;
}

interface Step {
  id: string;
  title: string;
  status: string;
  timestamp?: string;
}

// ─── Panel state ─────────────────────────────────────────────────────────────

interface PanelState {
  open: boolean;
  judgeName: string;
  tab: 'proposal' | 'review';
}

// ─── Helpers (unchanged) ─────────────────────────────────────────────────────

function updateJudgeInDebateResult(
  current: DebateResponse | null,
  judgeName: string,
  field: 'Proposal' | 'Review',
  content: string
): DebateResponse | null {
  if (!current) {
    return {
      error: '',
      judges: [{ Name: judgeName, Model: '', Proposal: field === 'Proposal' ? content : '', Review: field === 'Review' ? content : '' }],
      verdict: { summary: '', reasoning: '', consensus: 0, total_judges: 0, confidence: 0 },
      duration: '',
      rounds: 3,
    };
  }
  const updatedJudges = current.judges.map(judge =>
    judge.Name === judgeName ? { ...judge, [field]: content } : judge
  );
  if (!updatedJudges.some(j => j.Name === judgeName)) {
    updatedJudges.push({
      Name: judgeName,
      Model: '',
      Proposal: field === 'Proposal' ? content : '',
      Review: field === 'Review' ? content : '',
    });
  }
  return { ...current, judges: updatedJudges };
}

// ─── Judge color map ──────────────────────────────────────────────────────────

const JUDGE_COLORS: Record<string, string> = {
  Alice: '#378ADD',
  Bob: '#7F77DD',
  Charlie: '#1D9E75',
  Diana: '#D4537E',
  Eve: '#D85A30',
};

function judgeColor(name: string) {
  return JUDGE_COLORS[name] || '#888780';
}

// ─── Markdown renderer (unchanged) ───────────────────────────────────────────

const MarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" {...props}>
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '12px',
          background: 'rgba(0,0,0,0.12)',
          padding: '1px 5px',
          borderRadius: '4px',
        }}
        {...props}
      >
        {children}
      </code>
    );
  },
};

// ─── App ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debateResult, setDebateResult] = useState<DebateResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [showFinalVerdict, setShowFinalVerdict] = useState(false);
  const [panel, setPanel] = useState<PanelState>({ open: false, judgeName: '', tab: 'proposal' });

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat on new content
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, debateResult, showFinalVerdict]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [inputText]);

  // ── Step helpers ────────────────────────────────────────────────────────────

  const addStep = (id: string, title: string, status = 'loading') => {
    setSteps(prev => [...prev, { id, title, status, timestamp: new Date().toLocaleTimeString() }]);
  };

  const updateStep = (id: string, status: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  // ── Stream event handler (logic UNCHANGED from original) ────────────────────

  const handleStreamEvent = (event: StreamEvent) => {
    console.log('📨 handleStreamEvent called:', event.type, event.message);

    switch (event.type) {
      case 'proposal':
        setDebateResult(prev => updateJudgeInDebateResult(prev, event.judge!, 'Proposal', event.data || ''));
        addStep(`proposal-${event.judge}`, `${event.judge} submitted a proposal`, 'done');
        break;

      case 'review':
        setDebateResult(prev => updateJudgeInDebateResult(prev, event.judge!, 'Review', event.data || ''));
        addStep(`review-${event.judge}`, `${event.judge} reviewed the others`, 'done');
        break;

      case 'step':
        if (event.step === 'round1_start') {
          addStep('round1', 'Round 1: Gathering proposals...', 'loading');
        } else if (event.step === 'round2_start') {
          updateStep('round1', 'done');
          addStep('round2', 'Round 2: Cross-examination...', 'loading');
        } else if (event.step === 'round3_start') {
          updateStep('round2', 'done');
          addStep('round3', 'Round 3: Reaching verdict...', 'loading');
        }
        break;

      case 'verdict':
        updateStep('round3', 'done');
        addStep('verdict', 'Final verdict reached', 'done');
        if (event.data) {
          setDebateResult(prev => ({
            ...prev!,
            verdict: event.data.verdict,
            duration: event.data.duration,
            rounds: event.data.rounds,
            error: event.data.error,
          }));
        }
        setShowFinalVerdict(true);
        break;

      case 'error':
        setErrorMessage(event.message);
        setIsLoading(false);
        break;

      case 'done':
        setIsLoading(false);
        break;
    }
  };

  // ── Submit (unchanged fetch/stream logic) ───────────────────────────────────

  const startDebate = async () => {
    if (!inputText.trim()) {
      setErrorMessage('Please enter an error to debug');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    setIsLoading(true);
    setDebateResult(null);
    setErrorMessage('');
    setSteps([]);
    setShowFinalVerdict(false);
    setPanel({ open: false, judgeName: '', tab: 'proposal' });

    try {
      console.log('🚀 Starting debate stream for:', inputText);

      const response = await fetch('/api/debate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ error: inputText }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      console.log('📡 Stream connected, reading events...');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) throw new Error('No reader available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) { console.log('🏁 Stream ended by server'); break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              console.log('📨 Received event:', event.type, event.message);
              handleStreamEvent(event);
            } catch (e) {
              console.error('Failed to parse event:', line, e);
            }
          } else if (line.startsWith(': ')) {
            console.log('💓 Keep-alive received');
          }
        }
      }
    } catch (error: any) {
      console.error('❌ Debate failed:', error);
      setErrorMessage(error.message || 'Failed to convene the jury. Please try again.');
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) startDebate();
    }
  };

  // ── Panel helpers ───────────────────────────────────────────────────────────

  const openPanel = (judgeName: string, tab: 'proposal' | 'review') => {
    setPanel({ open: true, judgeName, tab });
  };

  const closePanel = () => {
    setPanel(p => ({ ...p, open: false }));
  };

  const judges = debateResult?.judges || [];
  const activeJudge = judges.find(j => j.Name === panel.judgeName);
  const panelContent = panel.tab === 'proposal' ? activeJudge?.Proposal : activeJudge?.Review;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--color-background-tertiary)',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 20px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px' }}>⚖️</span>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>THINKSTACK</span>
        <span style={{
          fontSize: '11px',
          color: 'var(--color-text-secondary)',
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: '20px',
          padding: '2px 8px',
        }}>v2.0.0</span>
      </div>

      {/* ── Chat scroll area ─────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 20px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>

        {/* Empty state */}
        {steps.length === 0 && !isLoading && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--color-text-tertiary)',
            paddingBottom: '60px',
          }}>
            <span style={{ fontSize: '32px' }}>⚖️</span>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Debate. Refine. Converge.</p>
            <p style={{ fontSize: '12px' }}>Paste your error below and press Send</p>
          </div>
        )}

        {/* Progress steps */}
        {steps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            {steps.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {step.status === 'done' ? (
                  <span style={{ color: '#639922', fontSize: '11px', width: '14px' }}>✓</span>
                ) : (
                  <span style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    border: '1.5px solid var(--color-border-secondary)',
                    borderTopColor: 'var(--color-text-primary)',
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                )}
                <span style={{ color: step.status === 'done' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
                  {step.title}
                </span>
                {step.status === 'done' && step.timestamp && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{step.timestamp}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Judge chips — shown once we have any proposals or reviews */}
        {judges.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
              Judge submissions — click to view
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {judges.map(judge => (
                <React.Fragment key={judge.Name}>
                  {judge.Proposal && (
                    <button
                      onClick={() => openPanel(judge.Name, 'proposal')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: '0.5px solid var(--color-border-secondary)',
                        background: 'var(--color-background-primary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: judgeColor(judge.Name), flexShrink: 0 }} />
                      {judge.Name}
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}>proposal</span>
                    </button>
                  )}
                  {judge.Review && (
                    <button
                      onClick={() => openPanel(judge.Name, 'review')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        border: '0.5px solid var(--color-border-secondary)',
                        background: 'var(--color-background-primary)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: judgeColor(judge.Name), flexShrink: 0 }} />
                      {judge.Name}
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}>review</span>
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Final verdict — rendered like an assistant message */}
        {debateResult && showFinalVerdict && (
          <div style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '16px 18px',
            marginTop: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '16px' }}>⚖️</span>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Final verdict</span>
              <span style={{
                marginLeft: 'auto',
                fontSize: '11px',
                color: '#3B6D11',
                background: '#EAF3DE',
                borderRadius: '20px',
                padding: '2px 8px',
              }}>
                {debateResult.verdict?.consensus}/{debateResult.verdict?.total_judges} agreed
              </span>
            </div>

            <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.7 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                {(debateResult.verdict?.summary || '') + '\n\n' + (debateResult.verdict?.reasoning || '')}
              </ReactMarkdown>
            </div>

            {/* Stats row */}
            <div style={{
              display: 'flex',
              gap: '24px',
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '0.5px solid var(--color-border-tertiary)',
            }}>
              {[
                { val: judges.length, lbl: 'models' },
                { val: debateResult.rounds, lbl: 'rounds' },
                { val: `${debateResult.verdict?.confidence?.toFixed(0) ?? 0}%`, lbl: 'confidence' },
                { val: debateResult.duration || '—', lbl: 'duration' },
              ].map(s => (
                <div key={s.lbl} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{s.val}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {errorMessage && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--color-background-danger)',
            border: '0.5px solid var(--color-border-danger)',
            borderRadius: 'var(--border-radius-md)',
            fontSize: '13px',
            color: 'var(--color-text-danger)',
          }}>
            {errorMessage}
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* ── Bottom input bar ─────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: '10px 16px 12px',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '8px 10px 8px 14px',
          background: 'var(--color-background-secondary)',
        }}>
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
            placeholder="Paste your error here... (Enter to send, Shift+Enter for newline)"
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              maxHeight: '120px',
              overflowY: 'auto',
            }}
          />
          <button
            onClick={startDebate}
            disabled={isLoading || !inputText.trim()}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: isLoading || !inputText.trim() ? 'var(--color-background-tertiary)' : 'var(--color-text-primary)',
              cursor: isLoading || !inputText.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            {isLoading ? (
              <span style={{
                width: '12px', height: '12px',
                borderRadius: '50%',
                border: '1.5px solid var(--color-border-secondary)',
                borderTopColor: 'var(--color-text-secondary)',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite',
              }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 12V2M2 7l5-5 5 5" stroke="var(--color-background-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '5px', textAlign: 'center' }}>
          Powered by OpenRouter · multi-model debate
        </p>
      </div>

      {/* ── Slide-in panel overlay ───────────────────────────────────────────── */}
      {panel.open && (
        <div
          onClick={closePanel}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.25)',
            zIndex: 40,
          }}
        />
      )}

      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, 85vw)',
        background: 'var(--color-background-primary)',
        borderLeft: '0.5px solid var(--color-border-tertiary)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        transform: panel.open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* Panel header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          flexShrink: 0,
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: judgeColor(panel.judgeName),
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', flex: 1 }}>
            {panel.judgeName}
          </span>
          <button
            onClick={closePanel}
            style={{
              width: '24px', height: '24px', borderRadius: '50%',
              border: '0.5px solid var(--color-border-tertiary)',
              background: 'var(--color-background-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Panel tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          flexShrink: 0,
        }}>
          {(['proposal', 'review'] as const).map(tab => {
            const judge = judges.find(j => j.Name === panel.judgeName);
            const hasContent = tab === 'proposal' ? !!judge?.Proposal : !!judge?.Review;
            return (
              <button
                key={tab}
                onClick={() => setPanel(p => ({ ...p, tab }))}
                disabled={!hasContent}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: hasContent ? 'pointer' : 'not-allowed',
                  color: panel.tab === tab ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: panel.tab === tab ? '1.5px solid var(--color-text-primary)' : '1.5px solid transparent',
                  fontWeight: panel.tab === tab ? 500 : 400,
                  opacity: hasContent ? 1 : 0.4,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Panel content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          fontSize: '13px',
          color: 'var(--color-text-primary)',
          lineHeight: 1.7,
        }}>
          {panelContent ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
              {panelContent}
            </ReactMarkdown>
          ) : (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              {isLoading ? 'Waiting for response...' : 'No content yet'}
            </span>
          )}
        </div>
      </div>

      {/* ── Global keyframe ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button { font-family: var(--font-sans); }
        textarea::placeholder { color: var(--color-text-tertiary); }
        textarea::-webkit-scrollbar { width: 4px; }
        textarea::-webkit-scrollbar-thumb { background: var(--color-border-secondary); border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default App;