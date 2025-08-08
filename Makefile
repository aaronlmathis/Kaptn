SHELL := /usr/bin/env bash

# Build variables
BINARY_NAME := server
BUILD_DIR := bin
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "v0.1.0-dev")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GO_VERSION := $(shell go version | cut -d ' ' -f 3)

# Go build flags
LDFLAGS := -X github.com/aaronlmathis/kaptn/internal/version.Version=$(VERSION) \
           -X github.com/aaronlmathis/kaptn/internal/version.GitCommit=$(GIT_COMMIT) \
           -X github.com/aaronlmathis/kaptn/internal/version.BuildDate=$(BUILD_DATE)

.PHONY: all dev fmt lint test frontend build docker docker-debug kind-up kind-down clean help push push-debug run

all: build ## Build everything

dev: ## Run backend in development mode with hot reload
	@echo "Starting development server..."
	@go run -ldflags "$(LDFLAGS)" ./cmd/server &
	@echo "Backend PID: $$!"
	@echo "Starting frontend development server..."
	@cd frontend && npm run dev

fmt: ## Format code
	@echo "Formatting Go code..."
	@go fmt ./...
	@echo "Formatting frontend code..."
	@cd frontend && npm run format 2>/dev/null || echo "No format script found"

lint: ## Lint code
	@echo "Linting Go code..."
	@go vet ./...
	@echo "Linting frontend code..."
	@cd frontend && npm run lint 2>/dev/null || echo "No lint script found"

lint-fix: ## Fix linting issues
	@echo "Fixing Go formatting..."
	@go fmt ./...
	@echo "Fixing frontend linting issues..."
	@cd frontend && npm run lint:fix 2>/dev/null || echo "No lint:fix script found"

type-check: ## Check TypeScript types
	@echo "Checking TypeScript types..."
	@cd frontend && npm run type-check

test: ## Run tests
	@echo "Running Go tests..."
	@go test ./... -race -count=1 -v
	@echo "Running frontend tests..."
	@cd frontend && npm run test:run 2>/dev/null || echo "No test script found"

test-go: ## Run only Go tests
	@echo "Running Go tests..."
	@go test ./... -race -count=1 -v

test-frontend: ## Run only frontend tests
	@echo "Running frontend unit tests..."
	@cd frontend && npm run test:run

test-e2e: ## Run end-to-end tests
	@echo "Running E2E tests..."
	@cd frontend && npm run test:e2e

test-coverage: ## Run tests with coverage
	@echo "Running Go tests with coverage..."
	@go test ./... -race -count=1 -coverprofile=coverage.out
	@go tool cover -html=coverage.out -o coverage.html
	@echo "Running frontend tests with coverage..."
	@cd frontend && npm run test:coverage

test-watch: ## Run frontend tests in watch mode
	@echo "Running frontend tests in watch mode..."
	@cd frontend && npm run test:watch

frontend: ## Build frontend
	@echo "Building frontend..."
	@cd frontend && npm ci && npm run build
	@echo "Frontend built successfully"

build: frontend ## Build backend binary (embeds frontend)
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	@CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/server
	@echo "Binary built: $(BUILD_DIR)/$(BINARY_NAME)"

run: build ## Run the built binary
	@echo "Running $(BINARY_NAME)..."
	@$(BUILD_DIR)/$(BINARY_NAME)

IMAGE_NAME := aaronlmathis/kaptn

docker: frontend ## Build Docker image
	@echo "Building Docker image..."
	@docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(IMAGE_NAME):$(VERSION) .
	@docker tag $(IMAGE_NAME):$(VERSION) $(IMAGE_NAME):latest
	@echo "Docker image built: $(IMAGE_NAME):$(VERSION)"

docker-debug: frontend
	@echo "Building Docker debug image (with shell)..."
	@docker build \
		--target debug \
		--no-cache \
		--build-arg VERSION=debug \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(IMAGE_NAME):debug .
	@echo "Docker debug image built: $(IMAGE_NAME):debug"

push: docker ## Push Docker image to registry
	@echo "Pushing Docker image..."
	@docker push $(IMAGE_NAME):$(VERSION)
	@docker push $(IMAGE_NAME):latest

push-debug: docker-debug ## Push Docker debug image to registry
	@echo "Pushing Docker debug image..."
	@docker push $(IMAGE_NAME):debug

kind-up: ## Create Kind cluster for development
	@echo "Creating Kind cluster..."
	@kind create cluster --name kaptn-dev --wait 300s
	@echo "Kind cluster 'kaptn-dev' created"

kind-down: ## Delete Kind cluster
	@echo "Deleting Kind cluster..."
	@kind delete cluster --name kaptn-dev
	@echo "Kind cluster 'kaptn-dev' deleted"

install-deps: ## Install all dependencies
	@echo "Installing Go dependencies..."
	@go mod download
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install
	@echo "Dependencies installed"

help: ## Show this help
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@cd frontend && rm -rf dist node_modules/.vite 2>/dev/null || true
	@echo "Clean complete"