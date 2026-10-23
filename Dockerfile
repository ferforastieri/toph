# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY brand/ /src/brand/
COPY web/ ./
RUN npm run build:app

FROM golang:1.26-bookworm AS build
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=web /src/web/dist/app ./internal/webui/dist
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
