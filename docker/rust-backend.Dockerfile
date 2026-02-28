# syntax=docker/dockerfile:1.7

FROM rust:1.88-bookworm AS builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
    protobuf-compiler \
    pkg-config \
    libssl-dev \
    ca-certificates \
    binutils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/richcrab
COPY richcrab/ ./

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/app/richcrab/target,sharing=locked \
    cargo build --release --locked \
    -p entitlements \
    -p game \
    -p join \
    -p quiz \
    -p bot \
    -p bot_ingress \
    -p auth \
    && install -m 0755 target/release/entitlements /usr/local/bin/entitlements \
    && install -m 0755 target/release/game         /usr/local/bin/game \
    && install -m 0755 target/release/join         /usr/local/bin/join \
    && install -m 0755 target/release/quiz         /usr/local/bin/quiz \
    && install -m 0755 target/release/bot          /usr/local/bin/bot \
    && install -m 0755 target/release/bot_ingress  /usr/local/bin/bot_ingress \
    && install -m 0755 target/release/auth         /usr/local/bin/auth \
    && strip /usr/local/bin/entitlements /usr/local/bin/game /usr/local/bin/join /usr/local/bin/quiz /usr/local/bin/bot /usr/local/bin/bot_ingress /usr/local/bin/auth

FROM debian:bookworm-slim AS runtime

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/richcrab

COPY richcrab/migrations /app/richcrab/migrations

COPY --from=builder /usr/local/bin/entitlements /usr/local/bin/entitlements
COPY --from=builder /usr/local/bin/game         /usr/local/bin/game
COPY --from=builder /usr/local/bin/join         /usr/local/bin/join
COPY --from=builder /usr/local/bin/quiz         /usr/local/bin/quiz
COPY --from=builder /usr/local/bin/bot          /usr/local/bin/bot
COPY --from=builder /usr/local/bin/bot_ingress  /usr/local/bin/bot_ingress
COPY --from=builder /usr/local/bin/auth         /usr/local/bin/auth