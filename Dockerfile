# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/brand/package.json packages/brand/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci
COPY packages/brand ./packages/brand
COPY packages/ui ./packages/ui
COPY apps/web ./apps/web
RUN npm run build:web

FROM golang:1.26-bookworm AS build
WORKDIR /src/services/toph
COPY services/toph/go.mod services/toph/go.sum ./
RUN go mod download
COPY services/toph/ ./
COPY --from=web /src/apps/web/dist ./internal/webui/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/toph ./cmd/toph

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates bash git ripgrep openssh-client tini \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /bin/bash toph \
    && mkdir -p /data /workspaces \
    && chown -R toph:toph /data /workspaces
COPY --from=build /out/toph /usr/local/bin/toph
USER toph
WORKDIR /home/toph
ENV TOPH_ADDR=0.0.0.0:8787 \
    TOPH_DATA_DIR=/data \
    TOPH_WORKSPACES=/workspaces
EXPOSE 8787
VOLUME ["/data", "/workspaces"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/toph"]
