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
    pub mode: Option<String>,
    pub vault: Option<VaultConfig>,
    pub sponsor: Option<SponsorConfig>,
    pub batch: Option<BatchConfig>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SponsorConfig {
    pub mode: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchConfig {
    #[serde(rename = "minUsd")]
    pub min_usd: Option<String>,
    #[serde(rename = "intervalSec")]
    pub interval_sec: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VaultConfig {
    #[serde(rename = "networkId")]
    pub network_id: String,
    pub address: String,
    #[serde(rename = "type")]
    pub vault_type: String,
    pub note: Option<String>,
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
    pub contract: Option<TreasuryContractMeta>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TreasuryContractMeta {
    pub name: Option<String>,
    pub version: Option<String>,
    #[serde(rename = "sweepOperator")]
    pub sweep_operator: Option<String>,
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
    validate_config(&config)?;
    Ok(config)
}

pub fn validate_config(config: &AppConfig) -> anyhow::Result<()> {
    if let Some(settlement) = &config.settlement {
        if let (Some(target), Some(vault)) = (&settlement.target_network_id, &settlement.vault) {
            if target != &vault.network_id {
                anyhow::bail!(
                    "settlement.targetNetworkId ({target}) must match settlement.vault.networkId ({})",
                    vault.network_id
                );
            }
            if get_network_by_id(config, target).is_none() {
                anyhow::bail!("settlement target network '{target}' not found or disabled");
            }
        }
        for network in get_enabled_networks(config) {
            if network.treasury.treasury_type.eq_ignore_ascii_case("Contract")
                && network.network_type == "evm"
                && network.treasury.contract.is_none()
            {
                tracing::warn!(
                    "network {} treasury.type=Contract without treasury.contract metadata",
                    network.id
                );
            }
        }
    }
    Ok(())
}

pub fn settlement_mode(config: &AppConfig) -> &str {
    config
        .settlement
        .as_ref()
        .and_then(|s| s.mode.as_deref())
        .unwrap_or("testnet_hybrid")
}

pub fn settlement_target(config: &AppConfig) -> Option<(String, VaultConfig)> {
    let settlement = config.settlement.as_ref()?;
    let vault = settlement.vault.as_ref()?.clone();
    let target = settlement
        .target_network_id
        .clone()
        .unwrap_or(vault.network_id.clone());
    Some((target, vault))
}

pub fn is_evm_contract_treasury(network: &Network) -> bool {
    network.network_type == "evm" && network.treasury.treasury_type.eq_ignore_ascii_case("Contract")
}

pub fn recommended_stable_token(network: &Network) -> Option<&PaymentToken> {
    network
        .payment_tokens
        .iter()
        .find(|t| t.recommended.unwrap_or(false) && !t.native.unwrap_or(false))
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
