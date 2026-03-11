package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"
	"strings"

	"github.com/joho/godotenv"
	"the_ai_jury/internal/council"  // Adjust to your module path
)

func main() {
	// Load .env file
	godotenv.Load()
	
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		log.Fatal("OPENROUTER_API_KEY not set - get one at https://openrouter.ai/keys")
	}

	// Create the council with OpenRouter
	c := council.NewCouncil(apiKey)

	// The error to debug
	errorCode := `
I'm getting: "panic: runtime error: invalid memory address or nil pointer dereference"
in my Go program. It happens when I try to write to a channel.
	`

	fmt.Println("\n⚖️  COUNCIL OF AI CONVENED (via OpenRouter)")
	fmt.Println("==========================================")
	fmt.Printf("Error: %.100s...\n\n", errorCode)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// ROUND 1: Initial proposals
	fmt.Println("📢 ROUND 1: Initial solutions...")
	proposals, err := c.Round1(ctx, errorCode)
	if err != nil {
		log.Fatal(err)
	}
	
	for _, p := range proposals {
		fmt.Printf("\n--- %s's Solution ---\n%s\n", p.JudgeName, p.Content)
	}

	// ROUND 2: Cross-examination
	fmt.Println("\n🔍 ROUND 2: Reviewing each other...")
	reviews, err := c.Round2(ctx, errorCode, proposals)
	if err != nil {
		log.Fatal(err)
	}
	
	for i, review := range reviews {
		fmt.Printf("\n--- %s's Review ---\n%s\n", c.Judges[i].Name, review)
	}

	// ROUND 3: Final verdict
	fmt.Println("\n⚖️  ROUND 3: Reaching consensus...")
	verdict, err := c.Round3(ctx, errorCode, proposals, reviews)
	if err != nil {
		log.Fatal(err)
	}
	
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("FINAL VERDICT")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println(verdict)
}