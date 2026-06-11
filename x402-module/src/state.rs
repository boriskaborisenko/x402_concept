use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Clone, Debug)]
pub struct AppState {
    pub inner: Arc<RwLock<StateData>>,
    pub events: broadcast::Sender<PaymentEventEnvelope>,
}

#[derive(Default, Debug)]
pub struct StateData {
    pub payment_intents: HashMap<String, Intent>,
    pub ledger: Vec<LedgerEntry>,
    pub payment_jobs: HashMap<String, PaymentJob>,
}

#[derive(Clone, Debug)]
pub struct PaymentJob {
    pub tx_hash: String,
    pub route_id: String,
    pub status: String,
    pub attempts: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct Intent {
    pub id: String,
    pub status: String,
    pub resource_id: String,
    pub resource_name: String,
    pub resource_description: String,
    pub request_hash: String,
    pub price_in_usd: String,
    pub merchant_id: String,
    pub merchant_name: String,
    pub settlement_network_id: String,
    pub settlement_asset: String,
    pub expires_at: String,
    pub nonce: String,
    pub routes: Vec<PaymentRoute>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRoute {
    pub id: String,
    pub network_id: String,
    pub chain: String,
    pub asset: String,
    pub amount: String,
    pub decimals: u32,
    pub recipient: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<u64>,
    pub recommended: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settlement_rail: Option<String>,
    pub execution: String,
    pub instant_unlock: bool,
    pub estimated_fee: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub payment_intent_id: String,
    pub request_hash: String,
    pub resource_id: String,
    pub source_chain: String,
    pub source_asset: String,
    pub payment_source_tx: String,
    pub amount_usd: String,
    pub crypto_amount: String,
    pub settlement_rail: String,
    pub settlement_status: String,
    pub unlocked_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct PaymentEventEnvelope {
    pub intent_id: String,
    pub event: serde_json::Value,
}

impl AppState {
    pub fn new() -> Self {
        let (events, _) = broadcast::channel(128);
        Self {
            inner: Arc::new(RwLock::new(StateData::default())),
            events,
        }
    }
}
