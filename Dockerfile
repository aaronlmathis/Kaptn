# Build stage for frontend
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build

# Build stage for backend
FROM golang:1.22-alpine AS build
WORKDIR /src

# Install git for version info
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Copy built frontend
COPY --from=frontend /frontend/dist ./frontend/dist

# Build binary with version info
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
	-ldflags "-X github.com/aaronlmathis/k8s-admin-dash/internal/version.Version=${VERSION} \
	-X github.com/aaronlmathis/k8s-admin-dash/internal/version.GitCommit=${GIT_COMMIT} \
	-X github.com/aaronlmathis/k8s-admin-dash/internal/version.BuildDate=${BUILD_DATE}" \
	-o /server ./cmd/server

# Final stage
FROM gcr.io/distroless/base-debian12
COPY --from=build /server /server

# Add metadata
LABEL org.opencontainers.image.title="Kubernetes Admin Dashboard"
LABEL org.opencontainers.image.description="A secure, production-ready Kubernetes admin dashboard"
LABEL org.opencontainers.image.source="https://github.com/aaronlmathis/k8s-admin-dash"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD ["/server", "--health-check"]

EXPOSE 8080
ENTRYPOINT ["/server"]
