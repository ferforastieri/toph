# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/landing/package.json apps/landing/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/brand/package.json packages/brand/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/icons/package.json packages/icons/package.json
RUN npm ci
COPY packages/brand ./packages/brand
COPY packages/ui ./packages/ui
COPY packages/icons ./packages/icons
COPY apps/web ./apps/web
RUN npm run build:web

FROM rust:1-bookworm AS build
ARG TOPH_VERSION=dev
ENV TOPH_VERSION=${TOPH_VERSION}
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY services/toph/Cargo.toml services/toph/Cargo.lock services/toph/build.rs ./services/toph/
COPY services/toph/src ./services/toph/src
COPY --from=web /src/apps/web/dist ./apps/web/dist
RUN cargo build --release --manifest-path services/toph/Cargo.toml --bin toph

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates bash git ripgrep openssh-client tini libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /bin/bash toph \
    && mkdir -p /data /workspaces \
    && chown -R toph:toph /data /workspaces
COPY --from=build /src/services/toph/target/release/toph /usr/local/bin/toph
USER toph
WORKDIR /home/toph
ENV TOPH_ADDR=0.0.0.0:8787 \
    TOPH_DATA_DIR=/data \
    TOPH_WORKSPACES=/workspaces
EXPOSE 8787
VOLUME ["/data", "/workspaces"]
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/toph"]
