FROM rust:1.84-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        protobuf-compiler \
        pkg-config \
        libssl-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/richcrab
