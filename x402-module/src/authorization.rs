use crate::adapters::{algo, evm};
use crate::config::{
    get_network_by_id, get_rate, is_evm_contract_treasury, settlement_mode, settlement_target,
    AppConfig, Network,
};
use crate::state::{Intent, LedgerEntry, PaymentRoute, StateData};
use chrono::{Duration, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

pub fn create_intent(config: &AppConfig, resource_id: &str) -> Result<Intent, String> {
    let resource = config
        .resources
        .iter()
        .find(|r| r.id == resource_id)
        .ok_or_else(|| "Resource not found".to_string())?;

    let merchant = config
        .merchants
        .get("m_001")
        .ok_or_else(|| "merchants.m_001 missing".to_string())?;

    let intent_id = format!("pi_{}", Uuid::new_v4().to_string().replace('-', "")[..16].to_string());
    let nonce = format!("n_{}", Uuid::new_v4().to_string().replace('-', "")[..12].to_string());
    let ts = Utc::now().timestamp_millis();
    let request_hash = format!(
        "0x{}",
        hex::encode(format!("{}-{}", resource_id, ts).as_bytes())
            .chars()
            .take(40)
            .collect::<String>()
    );

    let price_usd: f64 = resource.price_in_usd.parse().unwrap_or(0.0);
    let routes = build_payment_routes(config, price_usd);
    let expires_at = (Utc::now() + Duration::minutes(15)).to_rfc3339();

    Ok(Intent {
        id: intent_id,
        status: "created".into(),
        resource_id: resource.id.clone(),
        resource_name: resource.name.clone(),
        resource_description: resource.description.clone(),
        request_hash,
        price_in_usd: resource.price_in_usd.clone(),
        merchant_id: merchant.id.clone(),
        merchant_name: merchant.name.clone(),
        settlement_network_id: merchant.settlement.network_id.clone(),
        settlement_asset: merchant.settlement.asset.clone(),
        expires_at,
        nonce,
        routes,
    })
}

fn build_payment_routes(config: &AppConfig, price_usd: f64) -> Vec<PaymentRoute> {
    let mut routes = Vec::new();
    for network in config.networks.iter().filter(|n| n.enabled.unwrap_or(true)) {
        for token in &network.payment_tokens {
            let amount = format_amount(price_usd / get_rate(config, &token.symbol), token.decimals);
            let execution = if token.native.unwrap_or(false) {
                "native_transfer".to_string()
            } else if network.network_type == "algo" {
                "algorand_asa_transfer".to_string()
            } else {
                "evm_transfer".to_string()
            };
            let fee_symbol = &network.native.symbol;
            routes.push(PaymentRoute {
                id: format!("route_{}_{}", network.id, token.id),
                network_id: network.id.clone(),
                chain: network.id.clone(),
                asset: token.symbol.clone(),
                amount,
                decimals: token.decimals,
                recipient: network.treasury.address.clone(),
                token_address: token.address.clone(),
                asset_id: token.asset_id,
                recommended: token.recommended.unwrap_or(false),
                settlement_rail: token.settlement_rail.clone(),
                execution,
                instant_unlock: true,
                estimated_fee: format!("0.0008 {fee_symbol}"),
            });
        }
    }
    routes
}

fn format_amount(value: f64, decimals: u32) -> String {
    if decimals > 6 {
        format!("{:.6}", value)
    } else {
        format!("{:.2}", value)
    }
}

pub fn get_mock_resource(resource_id: &str) -> Value {
    match resource_id {
        "premium_advice" => json!({
            "type": "advice",
            "title": "Strategy Unlocked",
            "payload": "To expand your agentic network across both EVM and Non-EVM chains, deploy a Payment Intent Router on each."
        }),
        "api_key" => json!({
            "type": "api_key",
            "title": "Developer Credentials",
            "payload": format!("sk_x402_test_{}", &Uuid::new_v4().to_string().replace('-', "")[..24])
        }),
        "image_generation" => json!({
            "type": "image",
            "title": "Art Generation Success",
            "payload": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80"
        }),
        _ => json!({ "type": "generic", "title": "Unlocked", "payload": "Resource Content Unlocked!" }),
    }
}

pub async fn verify_route_payment(
    config: &AppConfig,
    state: &mut StateData,
    intent_id: &str,
    tx_hash: &str,
    route_id: &str,
) -> VerifyOutcome {
    let intent = match state.payment_intents.get(intent_id).cloned() {
        Some(i) => i,
        None => return VerifyOutcome::Error("Payment Intent not found.".into()),
    };

    if intent.status == "payment_verified" || intent.status == "access_unlocked" {
        return VerifyOutcome::AlreadyUnlocked(get_mock_resource(&intent.resource_id));
    }

    let route = match intent.routes.iter().find(|r| r.id == route_id) {
        Some(r) => r.clone(),
        None => return VerifyOutcome::Error("Selected route not found.".into()),
    };

    if state
        .ledger
        .iter()
        .any(|e| e.payment_source_tx == tx_hash)
    {
        return VerifyOutcome::Error("Transaction hash already used.".into());
    }

    let network = match get_network_by_id(config, &route.network_id) {
        Some(n) => n,
        None => return VerifyOutcome::Error("Network not found.".into()),
    };

    let verification = verify_on_network(network, &route, tx_hash).await;
    if !verification.success {
        return VerifyOutcome::Failed {
            pending: verification.pending,
            reason: verification.reason.unwrap_or_else(|| "Verification failed".into()),
            confirmations: verification.confirmations,
        };
    }

    let unlocked_at = Utc::now().to_rfc3339();
    let (target_network_id, vault_address) = settlement_target(config)
        .map(|(t, v)| (t, v.address))
        .unwrap_or_else(|| (route.chain.clone(), route.recipient.clone()));

    let (settlement_status, settlement_details) =
        initial_settlement_status(config, network, &route.chain, &target_network_id);

    let entry = LedgerEntry {
        payment_intent_id: intent_id.to_string(),
        request_hash: intent.request_hash.clone(),
        resource_id: intent.resource_id.clone(),
        source_chain: route.chain.clone(),
        source_asset: route.asset.clone(),
        payment_source_tx: tx_hash.to_string(),
        amount_usd: intent.price_in_usd.clone(),
        crypto_amount: route.amount.clone(),
        treasury_address: route.recipient.clone(),
        treasury_type: network.treasury.treasury_type.clone(),
        target_network_id,
        vault_address,
        settlement_rail: route.settlement_rail.clone().unwrap_or_else(|| "manual".into()),
        settlement_status,
        settlement_proof_tx: None,
        settled_at: None,
        settlement_details,
        unlocked_at: unlocked_at.clone(),
    };
    state.ledger.push(entry);

    if let Some(stored) = state.payment_intents.get_mut(intent_id) {
        stored.status = "access_unlocked".into();
    }

    VerifyOutcome::Success(get_mock_resource(&intent.resource_id))
}

struct NetworkVerification {
    success: bool,
    reason: Option<String>,
    pending: bool,
    confirmations: Option<u64>,
}

async fn verify_on_network(network: &Network, route: &PaymentRoute, tx_hash: &str) -> NetworkVerification {
    match network.network_type.as_str() {
        "evm" | "l2" => {
            let rpc = network.rpc_url.clone().unwrap_or_default();
            let result = evm::verify_evm_tx(
                &rpc,
                tx_hash,
                &route.recipient,
                &route.asset,
                &route.amount,
                route.token_address.as_deref(),
                &network.native.symbol,
                network.native.decimals,
                route.decimals,
            )
            .await;
            NetworkVerification {
                success: result.success,
                reason: result.reason,
                pending: result.pending,
                confirmations: result.confirmations,
            }
        }
        "algo" => {
            let facilitator = network.facilitator.as_ref();
            let algod = facilitator.map(|f| f.url.as_str()).unwrap_or("");
            let indexer = facilitator.and_then(|f| f.indexer_url.as_deref());
            let result = algo::verify_algo_tx(
                algod,
                indexer,
                tx_hash,
                &route.recipient,
                &route.asset,
                &route.amount,
                route.asset_id,
                &network.native.symbol,
                route.decimals,
            )
            .await;
            NetworkVerification {
                success: result.success,
                reason: result.reason,
                pending: result.pending,
                confirmations: None,
            }
        }
        other => NetworkVerification {
            success: false,
            reason: Some(format!("Unsupported network type: {other}")),
            pending: false,
            confirmations: None,
        },
    }
}

fn initial_settlement_status(
    config: &AppConfig,
    network: &Network,
    source_chain: &str,
    target_network_id: &str,
) -> (String, Option<String>) {
    if settlement_mode(config) == "mock" {
        return ("pending".into(), Some("mock mode".into()));
    }

    if source_chain != target_network_id {
        return (
            "pending".into(),
            Some(format!(
                "cross_chain: awaiting payout proof on {target_network_id} vault"
            )),
        );
    }

    if is_evm_contract_treasury(network) {
        return (
            "sweep_pending".into(),
            Some("same_chain contract treasury: awaiting relayer sweep".into()),
        );
    }

    (
        "pending".into(),
        Some("same_chain EOA: auto-settle on worker tick".into()),
    )
}

pub enum VerifyOutcome {
    Success(Value),
    AlreadyUnlocked(Value),
    Failed {
        pending: bool,
        reason: String,
        confirmations: Option<u64>,
    },
    Error(String),
}

