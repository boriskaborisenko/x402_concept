FROM node:20-alpine AS node-module
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ backend/
COPY config/ config/
ENV X402_CONFIG=/app/config/config.json
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "server.js"]

FROM rust:1.83-alpine AS rust-builder
WORKDIR /app/x402-module
RUN apk add --no-cache musl-dev openssl-dev pkgconfig
COPY x402-module/Cargo.toml x402-module/Cargo.lock* ./
COPY x402-module/src ./src
RUN cargo build --release

FROM alpine:3.20 AS rust-module
WORKDIR /app
RUN apk add --no-cache ca-certificates
COPY --from=rust-builder /app/x402-module/target/release/x402-module /usr/local/bin/x402-module
COPY config/config.json /app/config/config.json
ENV X402_CONFIG=/app/config/config.json
ENV PORT=4000
EXPOSE 4000
CMD ["x402-module"]
