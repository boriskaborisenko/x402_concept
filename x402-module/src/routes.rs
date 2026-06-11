use crate::authorization::{create_intent, verify_route_payment, VerifyOutcome};
use crate::config::{get_enabled_networks, AppConfig};
use crate::payment_watcher::{replay_unlocked_if_ready, submit_payment_job};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::stream::{self, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;

#[derive(Clone)]
pub struct AppContext {
    pub config: Arc<AppConfig>,
    pub state: AppState,
}

pub fn router(ctx: AppContext) -> Router {
    Router::new()
        .route("/api/resources", get(get_resources))
        .route("/api/networks", get(get_networks))
        .route("/api/config", get(get_config))
        .route("/api/payment-intent", post(create_payment_intent))
        .route("/api/payments/submit", post(submit_payment))
        .route("/api/payments/:intent_id/events", get(payment_events))
        .route("/api/verify-payment", post(verify_payment))
        .route("/api/ledger", get(get_ledger))
        .with_state(ctx)
}

async fn get_resources(State(ctx): State<AppContext>) -> Json<Value> {
    Json(json!(ctx.config.resources))
}

async fn get_networks(State(ctx): State<AppContext>) -> Json<Value> {
    Json(json!({
        "version": ctx.config.version,
        "settlement": ctx.config.settlement,
        "networks": public_networks(&ctx.config)
    }))
}

async fn get_config(State(ctx): State<AppContext>) -> Json<Value> {
    Json(json!({
        "version": ctx.config.version,
        "settlement": ctx.config.settlement,
        "networks": public_networks(&ctx.config),
        "chains": legacy_chains(&ctx.config)
    }))
}

#[derive(Deserialize)]
struct PaymentIntentBody {
    #[serde(rename = "resourceId")]
    resource_id: String,
}

async fn create_payment_intent(
    State(ctx): State<AppContext>,
    Json(body): Json<PaymentIntentBody>,
) -> impl IntoResponse {
    if body.resource_id.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "resourceId is required" }))).into_response();
    }

    match create_intent(&ctx.config, &body.resource_id) {
        Ok(intent) => {
            let payment_intent = json!({
                "id": intent.id,
                "amount_usd": intent.price_in_usd,
                "resource_id": intent.resource_id,
                "request_hash": intent.request_hash,
                "expires_at": intent.expires_at,
                "nonce": intent.nonce,
                "routes": intent.routes
            });
            ctx.state
                .inner
                .write()
                .await
                .payment_intents
                .insert(intent.id.clone(), intent);

            (
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({
                    "error": "payment_required",
                    "status": 402,
                    "payment_intent": payment_intent
                })),
            )
                .into_response()
        }
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": err })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SubmitBody {
    #[serde(rename = "intentId")]
    intent_id: String,
    #[serde(rename = "txHash")]
    tx_hash: String,
    #[serde(rename = "routeId")]
    route_id: String,
}

async fn submit_payment(
    State(ctx): State<AppContext>,
    Json(body): Json<SubmitBody>,
) -> impl IntoResponse {
    if body.intent_id.is_empty() || body.tx_hash.is_empty() || body.route_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "intentId, txHash, and routeId are required." })),
        )
            .into_response();
    }

    match submit_payment_job(
        ctx.config.clone(),
        ctx.state.clone(),
        body.intent_id.clone(),
        body.tx_hash,
        body.route_id,
    )
    .await
    {
        Ok(()) => (
            StatusCode::ACCEPTED,
            Json(json!({ "accepted": true, "intentId": body.intent_id })),
        )
            .into_response(),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": err })),
        )
            .into_response(),
    }
}

async fn payment_events(
    State(ctx): State<AppContext>,
    Path(intent_id): Path<String>,
) -> Result<Sse<impl futures::Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    if !ctx
        .state
        .inner
        .read()
        .await
        .payment_intents
        .contains_key(&intent_id)
    {
        return Err(StatusCode::NOT_FOUND);
    }

    let replay = replay_unlocked_if_ready(&ctx.state, &intent_id).await;
    let replay_stream = stream::iter(replay.into_iter().map(|event| {
        Ok(Event::default().data(event.to_string()))
    }));

    let rx = ctx.state.events.subscribe();
    let live_stream = BroadcastStream::new(rx).filter_map(move |msg| {
        let intent_id = intent_id.clone();
        async move {
            let msg = msg.ok()?;
            if msg.intent_id != intent_id {
                return None;
            }
            Some(Ok(Event::default().data(msg.event.to_string())))
        }
    });

    let merged = replay_stream.chain(live_stream);
    Ok(Sse::new(merged).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}

#[derive(Deserialize)]
struct VerifyBody {
    #[serde(rename = "intentId")]
    intent_id: String,
    #[serde(rename = "txHash")]
    tx_hash: String,
    #[serde(rename = "routeId")]
    route_id: String,
}

async fn verify_payment(
    State(ctx): State<AppContext>,
    headers: HeaderMap,
    Json(body): Json<VerifyBody>,
) -> impl IntoResponse {
    if body.intent_id.is_empty() || body.tx_hash.is_empty() || body.route_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "intentId, txHash, and routeId are required." })),
        )
            .into_response();
    }

    let outcome = {
        let mut data = ctx.state.inner.write().await;
        verify_route_payment(
            &ctx.config,
            &mut data,
            &body.intent_id,
            &body.tx_hash,
            &body.route_id,
        )
        .await
    };

    match outcome {
        VerifyOutcome::Success(content) | VerifyOutcome::AlreadyUnlocked(content) => {
            let mut response = json!({
                "success": true,
                "message": "Payment verified, resource unlocked successfully!",
                "access": { "status": "unlocked" },
                "resourceContent": content
            });
            if headers.get("x-merchant-admin") == Some(&"1".parse().unwrap()) {
                response["settlement"] = json!({ "status": "pending" });
            }
            (StatusCode::OK, Json(response)).into_response()
        }
        VerifyOutcome::Failed { reason, .. } => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "error": "verification_failed",
                "message": "The blockchain transaction could not be verified.",
                "reason": reason
            })),
        )
            .into_response(),
        VerifyOutcome::Error(err) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": err })),
        )
            .into_response(),
    }
}

async fn get_ledger(State(ctx): State<AppContext>) -> Json<Value> {
    let data = ctx.state.inner.read().await;
    Json(json!(data.ledger))
}

fn public_networks(config: &AppConfig) -> Vec<Value> {
    get_enabled_networks(config)
        .into_iter()
        .map(|network| {
            json!({
                "id": network.id,
                "name": network.name,
                "type": network.network_type,
                "chainId": network.chain_id,
                "explorerUrl": network.explorer_url,
                "treasury": network.treasury,
                "facilitator": network.facilitator,
                "native": network.native,
                "paymentTokens": network.payment_tokens
            })
        })
        .collect()
}

fn legacy_chains(config: &AppConfig) -> Value {
    let mut chains = serde_json::Map::new();
    for network in get_enabled_networks(config) {
        let recommended = network.payment_tokens.iter().find(|t| t.recommended.unwrap_or(false));
        chains.insert(
            network.id.clone(),
            json!({
                "name": network.name,
                "networkType": network.network_type,
                "chainId": network.chain_id,
                "algodUrl": network.facilitator.as_ref().map(|f| &f.url),
                "recipientAddress": network.treasury.address,
                "treasuryType": network.treasury.treasury_type,
                "usdcAddress": recommended.and_then(|t| t.address.clone()),
                "usdcAssetId": recommended.and_then(|t| t.asset_id),
                "explorerUrl": network.explorer_url,
                "nativeSymbol": network.native.symbol,
                "stableSymbol": recommended.map(|t| &t.symbol)
            }),
        );
    }
    Value::Object(chains)
}
