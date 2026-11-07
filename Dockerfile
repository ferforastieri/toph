# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY landing/preview/package.json landing/preview/package.json
COPY desktop/package.json desktop/package.json
COPY mobile/package.json mobile/package.json
COPY packages/brand/package.json packages/brand/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/icons/package.json packages/icons/package.json
RUN npm ci
COPY packages/brand ./packages/brand
COPY packages/ui ./packages/ui
COPY packages/icons ./packages/icons
COPY web ./web
RUN npm run build:web

FROM rust:1-bookworm AS build
ARG TOPH_VERSION=dev
ENV TOPH_VERSION=${TOPH_VERSION}
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY backend/Cargo.toml backend/Cargo.lock backend/build.rs ./backend/
COPY backend/src ./backend/src
COPY backend/skills ./backend/skills
COPY --from=web /src/web/dist ./web/dist
RUN cargo build --release --manifest-path backend/Cargo.toml --bin toph

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates bash git ripgrep openssh-client tini libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /bin/bash toph \
    && mkdir -p /data /workspaces \
    && chown -R toph:toph /data /workspaces
COPY --from=build /src/backend/target/release/toph /usr/local/bin/toph
USER toph
WORKDIR /home/toph
ENV TOPH_ADDR=0.0.0.0:8787 \
    TOPH_DATA_DIR=/data \
    TOPH_WORKSPACES=/workspaces
EXPOSE 8787
VOLUME ["/data", "/workspaces"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/toph"]
