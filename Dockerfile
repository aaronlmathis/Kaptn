# Frontend build stage
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Backend build stage
FROM golang:1.24.3-alpine AS build
WORKDIR /src
RUN apk add --no-cache git

# Go deps
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY cmd ./cmd
COPY internal ./internal
COPY config.yaml ./config.yaml

# Copy built frontend
COPY --from=frontend /frontend/dist ./frontend/dist


# Build binary with version info
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
	-ldflags "-X github.com/aaronlmathis/kaptn/internal/version.Version=${VERSION} \
	-X github.com/aaronlmathis/kaptn/internal/version.GitCommit=${GIT_COMMIT} \
	-X github.com/aaronlmathis/kaptn/internal/version.BuildDate=${BUILD_DATE}" \
	-o /server ./cmd/server


# ======================
# Final production image
# ======================
FROM gcr.io/distroless/base-debian12 AS prod
COPY --from=build /server /server

ARG VERSION
LABEL org.opencontainers.image.title="Kapn ${VERSION}"
LABEL org.opencontainers.image.description="A secure, production-ready Kubernetes admin dashboard"
LABEL org.opencontainers.image.source="https://github.com/aaronlmathis/kaptn"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD ["/server", "--health-check"]

EXPOSE 8080
ENTRYPOINT ["/server"]

# =====================
# Debug runtime image
# =====================
FROM alpine:3.20 AS debug
RUN apk add --no-cache bash curl
COPY --from=build /server /server

ARG VERSION
LABEL org.opencontainers.image.title="Kapn Debug ${VERSION}"
LABEL org.opencontainers.image.description="Debug build with shell access"
LABEL org.opencontainers.image.source="https://github.com/aaronlmathis/kaptn"

EXPOSE 8080
ENTRYPOINT ["/server"]
