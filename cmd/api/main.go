package main

import (
    "context"
    "encoding/json"
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
    // Load environment variables
    godotenv.Load()
    
    apiKey := os.Getenv("OPENROUTER_API_KEY")
    if apiKey == "" {
        log.Fatal("OPENROUTER_API_KEY not set")
    }
    
    // Create router
    r := mux.NewRouter()
    
    // API endpoints
    r.HandleFunc("/api/debate", func(w http.ResponseWriter, r *http.Request) {
        // Only accept POST
        if r.Method != http.MethodPost {
            http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
            return
        }
        
        // Parse request body
        var req ErrorRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "Invalid request body", http.StatusBadRequest)
            return
        }
        
        if req.Error == "" {
            http.Error(w, "Error field is required", http.StatusBadRequest)
            return
        }
        
        // Create council
        c := council.NewCouncil(apiKey)
        
        // Run debate with timeout
        ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
        defer cancel()
        
        result, err := c.FullDebate(ctx, req.Error)
        if err != nil {
            log.Printf("Debate error: %v", err)
            http.Error(w, "Debate failed: "+err.Error(), http.StatusInternalServerError)
            return
        }
        
        // Return JSON
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
    r.PathPrefix("/").Handler(http.FileServer(http.Dir("./web")))
    
    // CORS middleware
    handler := cors.Default().Handler(r)
    
    // Start server
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    log.Printf("🚀 API server starting on http://localhost:%s", port)
    log.Printf("   POST /api/debate - Run a debate")
    log.Printf("   GET  /health - Health check")
    log.Printf("   / - Static files from ./web")
    
    log.Fatal(http.ListenAndServe(":"+port, handler))
}