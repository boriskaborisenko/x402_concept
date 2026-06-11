mod adapters;
mod admin;
mod authorization;
mod config;
mod payment_watcher;
mod routes;
mod settlement;
mod state;

use crate::config::load_config;
use crate::routes::{router, AppContext};
use crate::settlement::start_settlement_worker;
use crate::state::AppState;
use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("x402_module=info".parse()?))
        .init();

    let config_path = env::var("X402_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../config/config.json"));

    let config = Arc::new(load_config(&config_path)?);
    tracing::info!("Loaded config from {}", config_path.display());
    let state = AppState::new();
    start_settlement_worker(config.clone(), state.clone());
    tracing::info!("Settlement worker started (interval 30s)");

    let ctx = AppContext {
        config: config.clone(),
        state,
    };

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4000);

    let app = router(ctx.clone())
        .merge(admin::router(ctx))
        .layer(CorsLayer::permissive());
    let bind_addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&bind_addr).await.map_err(|err| {
        anyhow::anyhow!(
            "Cannot bind {bind_addr}: {err}. Port {port} is already in use — stop the other process (often Node `npm start`) or run with PORT=4001 cargo run"
        )
    })?;
    tracing::info!("x402 Rust sidecar listening on port {port}");
    axum::serve(listener, app).await?;
    Ok(())
}
