FROM rust:slim

ARG RUST_TARGET=x86_64-unknown-linux-musl

COPY rust-toolchain.toml .
RUN rustup target add ${RUST_TARGET}
