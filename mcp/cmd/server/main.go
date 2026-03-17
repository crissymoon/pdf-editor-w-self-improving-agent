package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"xcmpdf/mcp/internal/config"
	"xcmpdf/mcp/internal/mcp"
	"xcmpdf/mcp/internal/providers"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	clients := providers.BuildClients(cfg)
	server := mcp.NewServer(cfg, clients)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := server.Run(ctx, os.Stdin, os.Stdout); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
