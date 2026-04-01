package council

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/hra42/openrouter-go"
)

// ========== TYPES ==========

// Judge is one AI with a personality
type Judge struct {
	Name  string
	Role  string
	Model string
}

// JudgeResponse is what we return to the frontend
type JudgeResponse struct {
	Name     string `json:"name"`
	Model    string `json:"model"`
	Role     string `json:"role"`
	Proposal string `json:"proposal"`
	Review   string `json:"review"`
}

// Proposal is one judge's answer
type Proposal struct {
	JudgeName string
	Content   string
}

// Council runs the debate using OpenRouter
type Council struct {
	Judges []Judge
	Client *openrouter.Client
	APIKey string
}

// CouncilVerdict is the final verdict structure
type CouncilVerdict struct {
	Summary      string  `json:"summary"`
	Reasoning    string  `json:"reasoning"`
	Consensus    int     `json:"consensus"`
	TotalJudges  int     `json:"total_judges"`
	Confidence   float64 `json:"confidence"`
}

// DebateResult is the complete API response
type DebateResult struct {
	Error            string         `json:"error"`
	Judges           []JudgeResponse `json:"judges"`
	Verdict          CouncilVerdict `json:"verdict"`
	Rounds           int            `json:"rounds"`
	Duration         string         `json:"duration"`
	Timestamp        string         `json:"timestamp"`
	ConsensusReached bool           `json:"consensus_reached"`
}

// StreamEvent for SSE streaming
type StreamEvent struct {
	Type    string      `json:"type"`
	Step    string      `json:"step"`
	Judge   string      `json:"judge,omitempty"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Status  string      `json:"status"`
}

// CouncilWithStream adds streaming callbacks
type CouncilWithStream struct {
	*Council
	onEvent func(StreamEvent)
}

// ========== HELPER FUNCTIONS ==========

// Helper to safely extract string from MessageContent
func getContentString(content openrouter.MessageContent) string {
	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		for _, part := range v {
			if partMap, ok := part.(map[string]interface{}); ok {
				if text, ok := partMap["text"].(string); ok {
					return text
				}
			}
		}
		return "[Complex content]"
	default:
		return "[Unable to parse content]"
	}
}

// Helper: Parse verdict into summary and reasoning
func parseVerdict(verdict string) (summary, reasoning string) {
	if idx := strings.Index(verdict, "⚖️ COUNCIL VERDICT:"); idx != -1 {
		verdict = strings.TrimSpace(verdict[idx+len("⚖️ COUNCIL VERDICT:"):])
	}

	lines := strings.Split(verdict, "\n")
	if len(lines) > 0 {
		summary = strings.TrimSpace(lines[0])
		if len(lines) > 1 {
			reasoning = strings.TrimSpace(strings.Join(lines[1:], "\n"))
		}
	}

	if summary == "" && len(verdict) > 0 {
		if len(verdict) > 200 {
			summary = verdict[:200]
		} else {
			summary = verdict
		}
		reasoning = verdict
	}

	return summary, reasoning
}

// Helper: Calculate consensus from verdict
func calculateConsensus(verdict string, totalJudges int) int {
	verdictLower := strings.ToLower(verdict)

	if strings.Contains(verdictLower, "both") || strings.Contains(verdictLower, "all") {
		return totalJudges
	} else if strings.Contains(verdictLower, "agrees") || strings.Contains(verdictLower, "consensus") {
		return totalJudges - 1
	}
	return totalJudges
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ========== COUNCIL CONSTRUCTOR ==========

// NewCouncil creates a new council
func NewCouncil(apiKey string) *Council {
	client := openrouter.NewClient(
		openrouter.WithAPIKey(apiKey),
		openrouter.WithTimeout(120*time.Second),
	)

	return &Council{
		Client: client,
		APIKey: apiKey,
		Judges: []Judge{
			{
				Name:  "Alice",
				Role:  "You give practical, working solutions. You prefer simple fixes.",
				Model: "stepfun/step-3.5-flash:free",
			},
			{
				Name:  "Bob",
				Role:  "You are thorough and cautionary. You look for edge cases and potential problems.",
				Model: "nvidia/nemotron-3-super-120b-a12b:free",
			},
		},
	}
}

// NewCouncilWithStream creates a council with streaming
func NewCouncilWithStream(apiKey string, onEvent func(StreamEvent)) *CouncilWithStream {
	return &CouncilWithStream{
		Council: NewCouncil(apiKey),
		onEvent: onEvent,
	}
}

// ========== COUNCIL METHODS ==========

// Round1: Both judges give their initial answers
func (c *Council) Round1(ctx context.Context, errorCode string) ([]Proposal, error) {
    proposals := make([]Proposal, len(c.Judges))
    var wg sync.WaitGroup
    var mu sync.Mutex
    
    for i, judge := range c.Judges {
        wg.Add(1)
        go func(idx int, j Judge) {
            defer wg.Done()
            
            messages := []openrouter.Message{
                {
                    Role:    "system",
                    Content: fmt.Sprintf("You are %s. %s Keep answers under 150 words.", j.Name, j.Role),
                },
                {
                    Role:    "user",
                    Content: fmt.Sprintf("Fix this error:\n%s", errorCode),
                },
            }
            
            // Use 60 second timeout per model call
            resp, err := c.callWithTimeout(ctx, j.Model, messages, 60*time.Second)
            
            if err != nil {
                mu.Lock()
                proposals[idx] = Proposal{
                    JudgeName: j.Name,
                    Content:   fmt.Sprintf("⚠️ Error: %v", err),
                }
                mu.Unlock()
                log.Printf("⚠️ Judge %s failed: %v", j.Name, err)
                return
            }
            
            if len(resp.Choices) > 0 {
                content := getContentString(resp.Choices[0].Message.Content)
                mu.Lock()
                proposals[idx] = Proposal{
                    JudgeName: j.Name,
                    Content:   content,
                }
                mu.Unlock()
                log.Printf("✅ %s submitted proposal", j.Name)
            }
        }(i, judge)
    }
    
    wg.Wait()
    return proposals, nil
}
// Round2: Each judge reviews the other's proposal
func (c *Council) Round2(ctx context.Context, errorCode string, proposals []Proposal) ([]string, error) {
	reviews := make([]string, len(c.Judges))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, judge := range c.Judges {
		wg.Add(1)
		go func(idx int, j Judge) {
			defer wg.Done()

			var otherProposal string
			var otherJudgeName string
			for _, p := range proposals {
				if p.JudgeName != j.Name {
					otherProposal = p.Content
					otherJudgeName = p.JudgeName
					break
				}
			}

			messages := []openrouter.Message{
				{
					Role:    "system",
					Content: fmt.Sprintf("You are %s, the reviewer. %s", j.Name, j.Role),
				},
				{
					Role: "user",
					Content: fmt.Sprintf(`
The original error:
%s

%s proposed this solution:
%s

Review their solution. What's good about it? What's missing or wrong?
Be specific but constructive. Keep your review under 150 words.
`, errorCode, otherJudgeName, otherProposal),
				},
			}

			resp, err := c.callWithTimeout(ctx, j.Model, messages, 55*time.Second)
			if err != nil {
				log.Printf("Review for %s failed: %v", j.Name, err)
				mu.Lock()
				reviews[idx] = fmt.Sprintf("Review failed: %v", err)
				mu.Unlock()
				return
			}

			if len(resp.Choices) > 0 {
				mu.Lock()
				reviews[idx] = getContentString(resp.Choices[0].Message.Content)
				mu.Unlock()
				fmt.Printf("🔍 %s reviewed others\n", j.Name)
			}
		}(i, judge)
	}

	wg.Wait()
	return reviews, nil
}

// Round3: Reach consensus
func (c *Council) Round3(ctx context.Context, errorCode string, proposals []Proposal, reviews []string) (string, error) {
	moderatorModel := "nvidia/nemotron-3-super-120b-a12b:free"

	debateHistory := ""
	for i, p := range proposals {
		debateHistory += fmt.Sprintf("\n## %s's Solution:\n%s\n", p.JudgeName, p.Content)
		debateHistory += fmt.Sprintf("\n## %s's Review:\n%s\n", c.Judges[i].Name, reviews[i])
	}

	messages := []openrouter.Message{
		{
			Role:    "system",
			Content: "You are the council moderator. Your job is to synthesize the debate into one final answer that both judges would agree on.",
		},
		{
			Role: "user",
			Content: fmt.Sprintf(`
Original error:
%s

Here is the full debate:
%s

Now write the FINAL answer that combines the best of both perspectives.
Start with "⚖️ COUNCIL VERDICT:" then give the solution.
Explain why this answer is better than either individual proposal.
`, errorCode, debateHistory),
		},
	}

	    resp, err := c.callWithTimeout(ctx, moderatorModel, messages, 55*time.Second)

	if err != nil {
		return "", err
	}

	if len(resp.Choices) > 0 {
		return getContentString(resp.Choices[0].Message.Content), nil
	}

	return "", fmt.Errorf("no response from moderator")
}

func (c *Council) callWithTimeout(ctx context.Context, model string, messages []openrouter.Message, timeout time.Duration) (*openrouter.ChatCompletionResponse, error) {
    // Create a context with timeout for this specific call
    callCtx, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()
    
    // Make the API call
    resp, err := c.Client.ChatComplete(
        callCtx,
        messages,
        openrouter.WithModel(model),
        openrouter.WithTemperature(0.7),
        openrouter.WithMaxTokens(500),
    )
    
    if err != nil {
        return nil, err
    }
    
    return resp, nil
}

// FullDebate runs all three rounds and returns structured data for API
func (c *Council) FullDebate(ctx context.Context, errorCode string) (*DebateResult, error) {
	startTime := time.Now()

	// Round 1: Get proposals
	proposals, err := c.Round1(ctx, errorCode)
	if err != nil {
		return nil, err
	}

	// Round 2: Get reviews
	reviews, err := c.Round2(ctx, errorCode, proposals)
	if err != nil {
		return nil, err
	}

	// Round 3: Get verdict
	verdictText, err := c.Round3(ctx, errorCode, proposals, reviews)
	if err != nil {
		return nil, err
	}

	// Parse verdict into summary and reasoning
	summary, reasoning := parseVerdict(verdictText)

	// Build judge responses
	judges := make([]JudgeResponse, len(c.Judges))
	for i, judge := range c.Judges {
		judges[i] = JudgeResponse{
			Name:     judge.Name,
			Model:    judge.Model,
			Role:     judge.Role,
			Proposal: proposals[i].Content,
			Review:   reviews[i],
		}
	}

	// Calculate consensus
	consensus := calculateConsensus(verdictText, len(judges))

	result := &DebateResult{
		Error:   errorCode,
		Judges:  judges,
		Verdict: CouncilVerdict{
			Summary:     summary,
			Reasoning:   reasoning,
			Consensus:   consensus,
			TotalJudges: len(judges),
			Confidence:  float64(consensus) / float64(len(judges)) * 100,
		},
		Rounds:           3,
		Duration:         time.Since(startTime).String(),
		Timestamp:        time.Now().Format(time.RFC3339),
		ConsensusReached: consensus >= len(judges)-1,
	}

	return result, nil
}

// ========== STREAMING METHODS ==========

// FullDebateStream runs debate with real-time streaming
func (c *CouncilWithStream) FullDebateStream(ctx context.Context, errorCode string) (*DebateResult, error) {
	startTime := time.Now()

	// Emit start event
	c.onEvent(StreamEvent{
		Type:    "step",
		Step:    "starting",
		Message: "Starting debate...",
		Status:  "loading",
	})

	// Round 1: Proposals with streaming
	c.onEvent(StreamEvent{
		Type:    "step",
		Step:    "round1_start",
		Message: "Round 1: Gathering proposals...",
		Status:  "loading",
	})

	proposals := make([]Proposal, len(c.Judges))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for i, judge := range c.Judges {
		wg.Add(1)
		go func(idx int, j Judge) {
			defer wg.Done()

			// Emit proposal started
			c.onEvent(StreamEvent{
				Type:    "step",
				Step:    "proposal_started",
				Judge:   j.Name,
				Message: fmt.Sprintf("%s is preparing a proposal...", j.Name),
				Status:  "loading",
			})

			messages := []openrouter.Message{
				{
					Role:    "system",
					Content: fmt.Sprintf("You are %s. %s Keep answers under 150 words.", j.Name, j.Role),
				},
				{
					Role:    "user",
					Content: fmt.Sprintf("Fix this error:\n%s", errorCode),
				},
			}

			resp, err := c.Client.ChatComplete(ctx, messages,
				openrouter.WithModel(j.Model),
				openrouter.WithTemperature(0.7),
				openrouter.WithMaxTokens(500),
			)

			if err != nil {
				log.Printf("Judge %s failed: %v", j.Name, err)
				c.onEvent(StreamEvent{
					Type:    "error",
					Judge:   j.Name,
					Message: fmt.Sprintf("%s failed: %v", j.Name, err),
					Status:  "error",
				})
				return
			}

			var content string
			if len(resp.Choices) > 0 {
				content = getContentString(resp.Choices[0].Message.Content)
			}

			// Emit proposal completed
			c.onEvent(StreamEvent{
				Type:    "proposal",
				Step:    "proposal_completed",
				Judge:   j.Name,
				Message: fmt.Sprintf("%s submitted a proposal", j.Name),
				Data:    content,
				Status:  "done",
			})

			mu.Lock()
			proposals[idx] = Proposal{JudgeName: j.Name, Content: content}
			mu.Unlock()
		}(i, judge)
	}

	wg.Wait()

	// Round 2: Reviews with streaming
	c.onEvent(StreamEvent{
		Type:    "step",
		Step:    "round2_start",
		Message: "Round 2: Cross-examination...",
		Status:  "loading",
	})

	reviews := make([]string, len(c.Judges))

	for i, judge := range c.Judges {
		wg.Add(1)
		go func(idx int, j Judge) {
			defer wg.Done()

			c.onEvent(StreamEvent{
				Type:    "step",
				Step:    "review_started",
				Judge:   j.Name,
				Message: fmt.Sprintf("%s is reviewing other proposals...", j.Name),
				Status:  "loading",
			})

			var otherProposal string
			var otherJudgeName string
			for _, p := range proposals {
				if p.JudgeName != j.Name {
					otherProposal = p.Content
					otherJudgeName = p.JudgeName
					break
				}
			}

			messages := []openrouter.Message{
				{
					Role:    "system",
					Content: fmt.Sprintf("You are %s, the reviewer. %s", j.Name, j.Role),
				},
				{
					Role: "user",
					Content: fmt.Sprintf(`
The original error:
%s

%s proposed this solution:
%s

Review their solution. What's good about it? What's missing or wrong?
Be specific but constructive. Keep your review under 150 words.
`, errorCode, otherJudgeName, otherProposal),
				},
			}

			resp, err := c.Client.ChatComplete(ctx, messages,
				openrouter.WithModel(j.Model),
				openrouter.WithTemperature(0.7),
				openrouter.WithMaxTokens(500),
			)

			if err != nil {
				log.Printf("Review for %s failed: %v", j.Name, err)
				return
			}

			var reviewContent string
			if len(resp.Choices) > 0 {
				reviewContent = getContentString(resp.Choices[0].Message.Content)
			}

			c.onEvent(StreamEvent{
				Type:    "review",
				Step:    "review_completed",
				Judge:   j.Name,
				Message: fmt.Sprintf("%s reviewed the others", j.Name),
				Data:    reviewContent,
				Status:  "done",
			})

			mu.Lock()
			reviews[idx] = reviewContent
			mu.Unlock()
		}(i, judge)
	}

	wg.Wait()

	// Round 3: Final verdict
	c.onEvent(StreamEvent{
		Type:    "step",
		Step:    "round3_start",
		Message: "Round 3: Reaching final verdict...",
		Status:  "loading",
	})

	verdictText, err := c.Round3(ctx, errorCode, proposals, reviews)
	if err != nil {
		return nil, err
	}

	summary, reasoning := parseVerdict(verdictText)

	judges := make([]JudgeResponse, len(c.Judges))
	for i, judge := range c.Judges {
		judges[i] = JudgeResponse{
			Name:     judge.Name,
			Model:    judge.Model,
			Role:     judge.Role,
			Proposal: proposals[i].Content,
			Review:   reviews[i],
		}
	}

	consensus := calculateConsensus(verdictText, len(judges))

	result := &DebateResult{
		Error:   errorCode,
		Judges:  judges,
		Verdict: CouncilVerdict{
			Summary:     summary,
			Reasoning:   reasoning,
			Consensus:   consensus,
			TotalJudges: len(judges),
			Confidence:  float64(consensus) / float64(len(judges)) * 100,
		},
		Rounds:           3,
		Duration:         time.Since(startTime).String(),
		Timestamp:        time.Now().Format(time.RFC3339),
		ConsensusReached: consensus >= len(judges)-1,
	}

	return result, nil
}