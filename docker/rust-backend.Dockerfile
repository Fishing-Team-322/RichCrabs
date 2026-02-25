FROM rust:1.84-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        protobuf-compiler \
        pkg-config \
        libssl-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/richcrab
COPY richcrab/ ./

RUN cargo build --release \
    -p entitlements \
    -p game \
    -p join \
    -p quiz \
    -p bot \
    -p bot_ingress

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/richcrab

COPY --from=builder /app/richcrab/target/release/entitlements /usr/local/bin/entitlements
COPY --from=builder /app/richcrab/target/release/game /usr/local/bin/game
COPY --from=builder /app/richcrab/target/release/join /usr/local/bin/join
COPY --from=builder /app/richcrab/target/release/quiz /usr/local/bin/quiz
COPY --from=builder /app/richcrab/target/release/bot /usr/local/bin/bot
COPY --from=builder /app/richcrab/target/release/bot_ingress /usr/local/bin/bot_ingress
