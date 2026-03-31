package council

import (
	"context"
	"fmt"
	"strings"
	"time"
	// "time"

	"github.com/hra42/openrouter-go"
)

// A Judge is one AI with a personality
type Judge struct {
	Name    string
	Role    string
	Model   string
}

type JudgeResponse struct {
	Name string `json: "name"`
	Model string `json: "model"`
	Role string `json: "role"`
	Proposal string `json: "proposal"`
	Review string `json: "review"`
}

// A Proposal is one judge's answer
type Proposal struct {
	JudgeName string
	Content   string
}

// Council runs the debate using OpenRouter
type Council struct {
	Judges    []Judge
	Client    *openrouter.Client
	APIKey    string
}

type CouncilVerdict struct {
    Summary   string   `json:"summary"`
    Reasoning string   `json:"reasoning"`
    Consensus int      `json:"consensus"` // Number of judges who agreed
    TotalJudges int    `json:"total_judges"`
    Confidence float64 `json:"confidence"` // Percentage of consensus
}

// DebateResult is the complete API response
type DebateResult struct {
    Error        string         `json:"error"`
    Judges       []JudgeResponse `json:"judges"`
    Verdict      CouncilVerdict `json:"verdict"`
    Rounds       int            `json:"rounds"`
    Duration     string         `json:"duration"`
    Timestamp    string         `json:"timestamp"`
    ConsensusReached bool `json: "concesus_reached"`
}

// NewCouncil creates a council with two judges using STABLE OpenRouter models
func NewCouncil(apiKey string) *Council {
	client := openrouter.NewClient(openrouter.WithAPIKey(apiKey))
	
	return &Council{
		Client: client,
		APIKey: apiKey,
		Judges: []Judge{
			{
				Name:    "Alice",
				Role:    "You give practical, working solutions. You prefer simple fixes.",
				Model:   "stepfun/step-3.5-flash:free",
			},
			{
				Name:    "Bob",
				Role:    "You are thorough and cautionary. You look for edge cases and potential problems.",
				Model:   "stepfun/step-3.5-flash:free",
			},
		},
	}
}

// Helper to safely extract string from MessageContent
func getContentString(content openrouter.MessageContent) string {
	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		// If it's a multi-part content, try to extract text
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

// Round1: Both judges give their initial answers
func (c *Council) Round1(ctx context.Context, errorCode string) ([]Proposal, error) {
	proposals := make([]Proposal, len(c.Judges))
	
	for i, judge := range c.Judges {
		// Create messages
		messages := []openrouter.Message{
			{
				Role:    "system",
				Content: fmt.Sprintf("You are %s. %s Keep answers under 150 words.", 
					judge.Name, judge.Role),
			},
			{
				Role:    "user",
				Content: fmt.Sprintf("Fix this error:\n%s", errorCode),
			},
		}
		
		// FIX: Pass messages FIRST, then options
		resp, err := c.Client.ChatComplete(
			ctx, 
			messages,  // messages come first
			openrouter.WithModel(judge.Model),
			openrouter.WithTemperature(0.7),
			openrouter.WithMaxTokens(500),
		)
		
		if err != nil {
			return nil, fmt.Errorf("judge %s failed: %w", judge.Name, err)
		}
		
		if len(resp.Choices) > 0 {
			// FIX: Extract content using helper
			content := getContentString(resp.Choices[0].Message.Content)
			proposals[i] = Proposal{
				JudgeName: judge.Name,
				Content:   content,
			}
			fmt.Printf("✅ %s submitted proposal\n", judge.Name)
		}
	}
	
	return proposals, nil
}

// Round2: Each judge reviews the other's proposal
func (c *Council) Round2(ctx context.Context, errorCode string, proposals []Proposal) ([]string, error) {
	reviews := make([]string, len(c.Judges))
	
	for i, judge := range c.Judges {
		// Find the OTHER judge's proposal
		var otherProposal string
		var otherJudgeName string
		for _, p := range proposals {
			if p.JudgeName != judge.Name {
				otherProposal = p.Content
				otherJudgeName = p.JudgeName
				break
			}
		}
		
		messages := []openrouter.Message{
			{
				Role:    "system",
				Content: fmt.Sprintf("You are %s, the reviewer. %s", judge.Name, judge.Role),
			},
			{
				Role:    "user",
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
		
		// FIX: Pass messages first
		resp, err := c.Client.ChatComplete(
			ctx, 
			messages,  // messages come first
			openrouter.WithModel(judge.Model),
			openrouter.WithTemperature(0.7),
			openrouter.WithMaxTokens(500),
		)
		
		if err != nil {
			return nil, err
		}
		
		if len(resp.Choices) > 0 {
			// FIX: Extract content using helper
			reviews[i] = getContentString(resp.Choices[0].Message.Content)
			fmt.Printf("🔍 %s reviewed others\n", judge.Name)
		}
	}
	
	return reviews, nil
}

// Round3: Reach consensus (using a third model as moderator)
func (c *Council) Round3(ctx context.Context, errorCode string, proposals []Proposal, reviews []string) (string, error) {
	// Use a different model as moderator for unbiased verdict
	moderatorModel := "nvidia/nemotron-3-super-120b-a12b:free"
	
	// Format the debate history
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
			Role:    "user",
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
	
	// FIX: Pass messages first
	resp, err := c.Client.ChatComplete(
		ctx, 
		messages,  // messages come first
		openrouter.WithModel(moderatorModel),
		openrouter.WithTemperature(0.5),
		openrouter.WithMaxTokens(800),
	)
	
	if err != nil {
		return "", err
	}
	
	if len(resp.Choices) > 0 {
		// FIX: Extract content using helper
		return getContentString(resp.Choices[0].Message.Content), nil
	}
	
	return "", fmt.Errorf("no response from moderator")
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
    
    // Calculate consensus (simplified - checks if verdict mentions agreement)
    consensus := calculateConsensus(verdictText, len(judges))
    
    result := &DebateResult{
        Error:            errorCode,
        Judges:           judges,
        Verdict: CouncilVerdict{
            Summary:       summary,
            Reasoning:     reasoning,
            Consensus:     consensus,
            TotalJudges:   len(judges),
            Confidence:    float64(consensus) / float64(len(judges)) * 100,
        },
        Rounds:           3,
        Duration:         time.Since(startTime).String(),
        Timestamp:        time.Now().Format(time.RFC3339),
        ConsensusReached: consensus >= len(judges)-1,
    }
    
    return result, nil
}

// Helper: Parse verdict into summary and reasoning
func parseVerdict(verdict string) (summary, reasoning string) {
    // Look for "COUNCIL VERDICT:" marker
    if idx := strings.Index(verdict, "⚖️ COUNCIL VERDICT:"); idx != -1 {
        verdict = strings.TrimSpace(verdict[idx+len("⚖️ COUNCIL VERDICT:"):])
    }
    
    // Try to split by newlines for a simple summary (first 2-3 lines)
    lines := strings.Split(verdict, "\n")
    if len(lines) > 0 {
        summary = strings.TrimSpace(lines[0])
        if len(lines) > 1 {
            reasoning = strings.TrimSpace(strings.Join(lines[1:], "\n"))
        }
    }
    
    if summary == "" {
        summary = verdict[:min(200, len(verdict))]
        reasoning = verdict
    }
    
    return summary, reasoning
}

// Helper: Calculate consensus from verdict
func calculateConsensus(verdict string, totalJudges int) int {
    verdictLower := strings.ToLower(verdict)
    
    // Count how many judges are mentioned as agreeing
    consensus := 0
    if strings.Contains(verdictLower, "both") || strings.Contains(verdictLower, "all") {
        consensus = totalJudges
    } else if strings.Contains(verdictLower, "agrees") || strings.Contains(verdictLower, "consensus") {
        consensus = totalJudges - 1
    } else {
        consensus = totalJudges // Assume agreement if not specified
    }
    
    return consensus
}

func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}