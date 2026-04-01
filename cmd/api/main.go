package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/gorilla/mux"
    "github.com/joho/godotenv"
    "github.com/rs/cors"
    
    "the_ai_jury/internal/council"
)

type ErrorRequest struct {
    Error string `json:"error"`
}

func main() {
    godotenv.Load()
    
    apiKey := os.Getenv("OPENROUTER_API_KEY")
    if apiKey == "" {
        log.Fatal("OPENROUTER_API_KEY not set")
    }
    
    r := mux.NewRouter()
    
    // SSE streaming endpoint
    // SSE streaming endpoint
r.HandleFunc("/api/debate/stream", func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }
    
    var req ErrorRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }
    
    if req.Error == "" {
        http.Error(w, "Error field is required", http.StatusBadRequest)
        return
    }
    
    // Set SSE headers with no buffering
    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("X-Accel-Buffering", "no") // Disable nginx buffering
    
    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
        return
    }
    
    // Create a context with a longer timeout (5 minutes)
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
    defer cancel()
    
    // Monitor client disconnect
    clientGone := r.Context().Done()

    
    // Start a keep-alive ping goroutine
    pingTicker := time.NewTicker(20 * time.Second)
    defer pingTicker.Stop()
    
    go func() {
        for {
            select {
            case <-pingTicker.C:
                // Send keep-alive comment (SSE comments are ignored by clients)
                fmt.Fprintf(w, ": keepalive\n\n")
                flusher.Flush()
            case <-ctx.Done():
                return
            case <-clientGone:
                return
            }
        }
    }()
    
    go func() {
        select {
        case <-clientGone:
            log.Println("Client disconnected, cancelling debate...")
            cancel()
        case <-ctx.Done():
            log.Println("Debate timeout reached")
        }
    }()
    
    // Send initial event
    sendEvent(w, flusher, council.StreamEvent{
        Type:    "step",
        Step:    "starting",
        Message: "Initializing debate...",
        Status:  "loading",
    })
    
    // Create council with streaming callback
    c := council.NewCouncilWithStream(apiKey, func(event council.StreamEvent) {
        // Check if context is still alive before sending
        select {
        case <-ctx.Done():
            return
        default:
            sendEvent(w, flusher, event)
        }
    })
    
    // Run debate with streaming
    result, err := c.FullDebateStream(ctx, req.Error)
    if err != nil {
        log.Printf("Debate error: %v", err)
        sendEvent(w, flusher, council.StreamEvent{
            Type:    "error",
            Message: err.Error(),
            Status:  "error",
        })
        return
    }
    
    // Send final verdict
    sendEvent(w, flusher, council.StreamEvent{
        Type:    "verdict",
        Step:    "final",
        Message: "Final verdict reached",
        Data:    result,
        Status:  "done",
    })
    
    // Send done event
    sendEvent(w, flusher, council.StreamEvent{
        Type:    "done",
        Message: "Debate complete",
        Status:  "done",
    })
    
}).Methods("POST")
    
    // Original endpoint (keep for backward compatibility)
    r.HandleFunc("/api/debate", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
            return
        }
        
        var req ErrorRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "Invalid request body", http.StatusBadRequest)
            return
        }
        
        if req.Error == "" {
            http.Error(w, "Error field is required", http.StatusBadRequest)
            return
        }
        
        c := council.NewCouncil(apiKey)
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
        defer cancel()
        
        result, err := c.FullDebate(ctx, req.Error)
        if err != nil {
            log.Printf("Debate error: %v", err)
            http.Error(w, "Debate failed: "+err.Error(), http.StatusInternalServerError)
            return
        }
        
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(result)
    }).Methods("POST")
    
    // Health check
    r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
    }).Methods("GET")
    
    // Static file server for frontend
    staticPath := "./web/ai-jury--/dist"
    r.PathPrefix("/").Handler(http.FileServer(http.Dir(staticPath)))
    
    handler := cors.Default().Handler(r)
    
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    log.Printf("🚀 API server starting on http://localhost:%s", port)
    log.Printf("   POST /api/debate - Run a debate (blocking)")
    log.Printf("   POST /api/debate/stream - Run a debate (streaming)")
    log.Printf("   📁 Serving static files from: %s", staticPath)
    
    log.Fatal(http.ListenAndServe(":"+port, handler))
}

// Helper to send SSE events
func sendEvent(w http.ResponseWriter, flusher http.Flusher, event council.StreamEvent) {
    data, err := json.Marshal(event)
    if err != nil {
        log.Printf("Failed to marshal event: %v", err)
        return
    }
    fmt.Fprintf(w, "data: %s\n\n", data)
    flusher.Flush()
}