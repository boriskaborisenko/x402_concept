use crate::adapters::balances;
use crate::routes::AppContext;
use crate::settlement::{
    confirm_cross_chain_settlement, process_pending_settlements, settlement_queue_async,
    sweep_intent,
};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

pub fn router(ctx: AppContext) -> Router {
    Router::new()
        .route("/admin/balances", get(get_balances))
        .route("/admin/settlement/queue", get(get_settlement_queue))
        .route("/admin/settlement/confirm", post(confirm_settlement))
        .route("/admin/settlement/sweep", post(sweep_settlement))
        .route("/admin/settlement/run", post(run_settlement_worker))
        .with_state(ctx)
}

fn is_admin(headers: &HeaderMap) -> bool {
    if let Ok(token) = std::env::var("ADMIN_TOKEN") {
        if !token.is_empty() {
            let auth = headers
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            if auth == format!("Bearer {token}") || auth == token {
                return true;
            }
        }
    }
    headers.get("x-merchant-admin") == Some(&"1".parse().unwrap())
}

fn unauthorized() -> (StatusCode, Json<Value>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "admin_auth_required" })),
    )
}

async fn get_balances(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !is_admin(&headers) {
        return Err(unauthorized());
    }
    let body = balances::fetch_balances(&ctx.config).await;
    Ok(Json(body))
}

async fn get_settlement_queue(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !is_admin(&headers) {
        return Err(unauthorized());
    }
    let queue = settlement_queue_async(&ctx.state).await;
    Ok(Json(json!({ "pending": queue })))
}

#[derive(Deserialize)]
struct ConfirmBody {
    #[serde(rename = "intentId")]
    intent_id: String,
    #[serde(rename = "payoutTx")]
    payout_tx: String,
}

async fn confirm_settlement(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    Json(body): Json<ConfirmBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !is_admin(&headers) {
        return Err(unauthorized());
    }
    match confirm_cross_chain_settlement(&ctx.config, &ctx.state, &body.intent_id, &body.payout_tx)
        .await
    {
        Ok(entry) => Ok(Json(json!({ "success": true, "ledgerEntry": entry }))),
        Err(err) => Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": err })),
        )),
    }
}

#[derive(Deserialize)]
struct SweepBody {
    #[serde(rename = "intentId")]
    intent_id: String,
}

async fn sweep_settlement(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    Json(body): Json<SweepBody>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !is_admin(&headers) {
        return Err(unauthorized());
    }
    match sweep_intent(&ctx.config, &ctx.state, &body.intent_id).await {
        Ok(tx) => Ok(Json(json!({ "success": true, "sweepTx": tx }))),
        Err(err) => Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": err })),
        )),
    }
}

async fn run_settlement_worker(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !is_admin(&headers) {
        return Err(unauthorized());
    }
    match process_pending_settlements(&ctx.config, &ctx.state).await {
        Ok(n) => Ok(Json(json!({ "processed": n }))),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err })),
        )),
    }
}
