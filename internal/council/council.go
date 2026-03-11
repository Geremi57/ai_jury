package council

import (
	"context"
	"fmt"
	// "time"

	"github.com/hra42/openrouter-go"
)

// A Judge is one AI with a personality
type Judge struct {
	Name    string
	Role    string
	Model   string
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
				Model:   "openai/gpt-4o",
			},
			{
				Name:    "Bob",
				Role:    "You are thorough and cautionary. You look for edge cases and potential problems.",
				Model:   "anthropic/claude-3.5-sonnet",
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
	moderatorModel := "meta-llama/llama-4-maverick"
	
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