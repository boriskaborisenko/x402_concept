use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppConfig {
    pub version: u32,
    pub merchants: HashMap<String, Merchant>,
    pub settlement: Option<SettlementConfig>,
    pub rates: Option<HashMap<String, f64>>,
    pub networks: Vec<Network>,
    pub resources: Vec<Resource>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Merchant {
    pub id: String,
    pub name: String,
    pub settlement: MerchantSettlement,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MerchantSettlement {
    #[serde(rename = "networkId")]
    pub network_id: String,
    pub asset: String,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SettlementConfig {
    #[serde(rename = "targetNetworkId")]
    pub target_network_id: Option<String>,
    pub vault: Option<VaultConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VaultConfig {
    #[serde(rename = "networkId")]
    pub network_id: String,
    pub address: String,
    #[serde(rename = "type")]
    pub vault_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Network {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub network_type: String,
    pub enabled: Option<bool>,
    #[serde(rename = "chainId")]
    pub chain_id: Option<u64>,
    #[serde(rename = "rpcUrl")]
    pub rpc_url: Option<String>,
    #[serde(rename = "explorerUrl")]
    pub explorer_url: Option<String>,
    pub facilitator: Option<Facilitator>,
    pub treasury: Treasury,
    pub native: NativeToken,
    #[serde(rename = "paymentTokens")]
    pub payment_tokens: Vec<PaymentToken>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Facilitator {
    #[serde(rename = "type")]
    pub facilitator_type: String,
    pub url: String,
    #[serde(rename = "indexerUrl")]
    pub indexer_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Treasury {
    pub address: String,
    #[serde(rename = "type")]
    pub treasury_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NativeToken {
    pub symbol: String,
    pub decimals: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PaymentToken {
    pub id: String,
    pub symbol: String,
    pub address: Option<String>,
    #[serde(rename = "assetId")]
    pub asset_id: Option<u64>,
    pub decimals: u32,
    pub native: Option<bool>,
    pub recommended: Option<bool>,
    #[serde(rename = "settlementRail")]
    pub settlement_rail: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Resource {
    pub id: String,
    pub name: String,
    #[serde(rename = "priceInUsd")]
    pub price_in_usd: String,
    pub description: String,
}

pub fn load_config(path: &Path) -> anyhow::Result<AppConfig> {
    let raw = fs::read_to_string(path)?;
    let config: AppConfig = serde_json::from_str(&raw)?;
    Ok(config)
}

pub fn get_enabled_networks(config: &AppConfig) -> Vec<&Network> {
    config
        .networks
        .iter()
        .filter(|n| n.enabled.unwrap_or(true))
        .collect()
}

pub fn get_network_by_id<'a>(config: &'a AppConfig, id: &str) -> Option<&'a Network> {
    get_enabled_networks(config)
        .into_iter()
        .find(|n| n.id == id)
}

pub fn get_rate(config: &AppConfig, symbol: &str) -> f64 {
    config
        .rates
        .as_ref()
        .and_then(|r| r.get(symbol).copied())
        .unwrap_or(1.0)
}
