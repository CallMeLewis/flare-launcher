# Builds the Linux packages (AppImage, .deb and .rpm) on Ubuntu 22.04. Linux programs run on systems at least as new
# as the one they were built on, so building here makes them work on Ubuntu 22.04, Debian 12 and anything newer.
# Used by `pnpm dist:linux` (scripts/build-linux.ts).
FROM docker.io/library/ubuntu:22.04
# Ties the image CI publishes to this repository, so its workflows can read it.
LABEL org.opencontainers.image.source=https://github.com/CallMeLewis/flare-launcher

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl file git patchelf pkg-config xz-utils \
      libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev \
    && rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=24.17.0
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 \
    && corepack enable

ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none

# pnpm's store lives in a volume (see scripts/build-linux.ts). Left alone, pnpm puts it beside the project, which here is
# the repo itself. Set in the global config, so pnpm runs started by other tools, such as Tauri's frontend build, use it.
RUN mkdir -p /root/.config/pnpm && printf 'store-dir=/pnpm-store\n' > /root/.config/pnpm/rc

# linuxdeploy, which packs the AppImage, is itself an AppImage; containers have no FUSE to mount it with.
ENV APPIMAGE_EXTRACT_AND_RUN=1

# Rust itself, from the repo's rust-toolchain.toml (passed in by scripts/build-linux.ts), so the container uses the same
# version as everywhere else. Last, so a Rust update only redoes this step.
ARG RUST_TOOLCHAIN
RUN test -n "$RUST_TOOLCHAIN" \
    && mkdir /tmp/rust && printf '%s\n' "$RUST_TOOLCHAIN" > /tmp/rust/rust-toolchain.toml \
    && cd /tmp/rust && rustup toolchain install && rm -rf /tmp/rust

WORKDIR /src
