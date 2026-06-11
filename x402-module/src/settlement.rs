use crate::adapters::{algo, evm};
use crate::config::{get_network_by_id, recommended_stable_token, settlement_mode, AppConfig};
use crate::state::{AppState, LedgerEntry};
use chrono::Utc;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

const SETTLEMENT_INTERVAL_SECS: u64 = 30;

pub fn start_settlement_worker(config: Arc<AppConfig>, state: AppState) {
    tokio::spawn(async move {
        loop {
            if let Err(err) = process_pending_settlements(&config, &state).await {
                tracing::error!("settlement worker error: {err}");
            }
            tokio::time::sleep(Duration::from_secs(SETTLEMENT_INTERVAL_SECS)).await;
        }
    });
}

pub async fn process_pending_settlements(
    config: &AppConfig,
    state: &AppState,
) -> Result<usize, String> {
    let mode = settlement_mode(config);
    if mode == "mock" {
        return process_mock_settlements(state).await;
    }

    let mut processed = 0usize;
    let entries: Vec<LedgerEntry> = {
        let data = state.inner.read().await;
        data.ledger
            .iter()
            .filter(|e| e.settlement_status == "pending" || e.settlement_status == "sweep_pending")
            .cloned()
            .collect()
    };

    for entry in entries {
        if entry.settlement_status == "pending" {
            if entry.source_chain != entry.target_network_id {
                if let Some(proof) = try_bridge_cross_chain(config, &entry).await {
                    mark_settled(state, &entry.payment_intent_id, proof, "cross-chain bridge (allbridge)").await?;
                    processed += 1;
                    continue;
                }
            } else if let Some(proof) = try_auto_settle_eoa(config, &entry).await {
                mark_settled(state, &entry.payment_intent_id, proof, "auto same-chain EOA").await?;
                processed += 1;
            }
        } else if entry.settlement_status == "sweep_pending" {
            if let Some(sweep_tx) = try_relayer_sweep(config, &entry).await {
                if verify_sweep(config, &entry, &sweep_tx).await {
                    mark_settled(state, &entry.payment_intent_id, sweep_tx, "contract treasury sweep")
                        .await?;
                    processed += 1;
                }
            }
        }
    }
    Ok(processed)
}

async fn process_mock_settlements(state: &AppState) -> Result<usize, String> {
    let vault = "vault".to_string();
    let mut data = state.inner.write().await;
    let mut processed = 0usize;
    for entry in data.ledger.iter_mut() {
        if entry.settlement_status != "pending" && entry.settlement_status != "sweep_pending" {
            continue;
        }
        let proof = mock_settlement_proof(&entry.source_chain);
        entry.settlement_status = "settled".into();
        entry.settlement_proof_tx = Some(proof.clone());
        entry.settled_at = Some(Utc::now().to_rfc3339());
        entry.settlement_details = Some("mock settlement".into());
        processed += 1;
        tracing::info!(
            "Settlement mock: {} → vault {}",
            entry.payment_intent_id,
            vault
        );
    }
    Ok(processed)
}

/// Algorand → BSC (and similar): invoke bridge-worker when BRIDGE_ALGO_TO_BSC=1.
async fn try_bridge_cross_chain(config: &AppConfig, entry: &LedgerEntry) -> Option<String> {
    if std::env::var("BRIDGE_ALGO_TO_BSC").ok().as_deref() != Some("1") {
        return None;
    }
    if entry.source_chain != "algorand" || entry.target_network_id != "bsc" {
        return None;
    }
    if entry.settlement_rail != "allbridge" && entry.settlement_rail != "manual" {
        return None;
    }

    let network = get_network_by_id(config, "algorand")?;
    let token = recommended_stable_token(network)?;
    let amount_micro = amount_to_chain_units(&entry.crypto_amount, token.decimals).ok()?;

    let vault = entry.vault_address.clone();
    let script = std::path::Path::new("bridge-worker/scripts/algo-to-bsc.mjs");
    let script = if script.exists() {
        script.to_path_buf()
    } else {
        std::path::Path::new("../bridge-worker/scripts/algo-to-bsc.mjs").to_path_buf()
    };
    if !script.exists() {
        tracing::warn!("bridge script not found: {}", script.display());
        return None;
    }

    let output = tokio::process::Command::new("node")
        .arg(&script)
        .arg("--amount")
        .arg(amount_micro.to_string())
        .arg("--vault")
        .arg(&vault)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        tracing::error!(
            "bridge-worker failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let bridge_tx = stdout
        .lines()
        .find_map(|line| line.strip_prefix("Bridge tx submitted:").map(|s| s.trim().to_string()))?;

    tracing::info!("Allbridge submitted algo tx {bridge_tx}, polling BSC vault…");
    let target = get_network_by_id(config, "bsc")?;
    let rpc = target.rpc_url.as_deref()?;
    let bsc_token = recommended_stable_token(target)?;
    let token_addr = bsc_token.address.as_deref()?;
    let min_units = amount_to_chain_units(&entry.crypto_amount, bsc_token.decimals).unwrap_or(0);

    for _ in 0..36 {
        tokio::time::sleep(Duration::from_secs(5)).await;
        if let Some(bal_raw) = evm::erc20_balance_raw(rpc, token_addr, &vault).await {
            if bal_raw >= min_units.saturating_mul(9).saturating_div(10) {
                return Some(format!("allbridge:{bridge_tx}"));
            }
        }
    }
    tracing::warn!("bridge submitted {bridge_tx} but BSC vault not confirmed yet");
    None
}

fn amount_to_chain_units(amount: &str, decimals: u32) -> Result<u128, String> {
    let parts: Vec<&str> = amount.split('.').collect();
    let whole: u128 = parts
        .first()
        .unwrap_or(&"0")
        .parse()
        .map_err(|e: std::num::ParseIntError| e.to_string())?;
    let frac_str = parts.get(1).copied().unwrap_or("");
    let mut frac = frac_str.to_string();
    while frac.len() < decimals as usize {
        frac.push('0');
    }
    frac.truncate(decimals as usize);
    let frac_val: u128 = if frac.is_empty() {
        0
    } else {
        frac.parse().map_err(|e: std::num::ParseIntError| e.to_string())?
    };
    let scale = 10u128.pow(decimals);
    Ok(whole * scale + frac_val)
}

async fn try_auto_settle_eoa(_config: &AppConfig, entry: &LedgerEntry) -> Option<String> {
    if entry.source_chain != entry.target_network_id {
        return None;
    }
    if entry.treasury_type.eq_ignore_ascii_case("Contract") {
        return None;
    }
    Some(entry.payment_source_tx.clone())
}

async fn try_relayer_sweep(config: &AppConfig, entry: &LedgerEntry) -> Option<String> {
  sweep::execute_sweep_all(config, entry).await.ok()
}

async fn verify_sweep(config: &AppConfig, entry: &LedgerEntry, sweep_tx: &str) -> bool {
    let network = match get_network_by_id(config, &entry.source_chain) {
        Some(n) => n,
        None => return false,
    };
    let rpc = match network.rpc_url.as_deref() {
        Some(u) => u,
        None => return false,
    };
    let token = match recommended_stable_token(network) {
        Some(t) => t,
        None => return false,
    };
    let token_addr = match token.address.as_deref() {
        Some(a) => a,
        None => return false,
    };
    let result = evm::verify_sweep_to_vault(
        rpc,
        sweep_tx,
        &entry.treasury_address,
        &entry.vault_address,
        token_addr,
        &entry.crypto_amount,
        token.decimals,
    )
    .await;
    result.success
}

pub async fn confirm_cross_chain_settlement(
    config: &AppConfig,
    state: &AppState,
    intent_id: &str,
    payout_tx: &str,
) -> Result<LedgerEntry, String> {
    let entry = {
        let data = state.inner.read().await;
        data.ledger
            .iter()
            .find(|e| e.payment_intent_id == intent_id)
            .cloned()
            .ok_or_else(|| "Ledger entry not found.".to_string())?
    };

    if entry.settlement_status == "settled" {
        return Err("Already settled.".into());
    }
    if entry.source_chain == entry.target_network_id {
        return Err("Same-chain entry; use sweep or auto-settle.".into());
    }

    let target_network = get_network_by_id(config, &entry.target_network_id)
        .ok_or_else(|| "Target network not found.".to_string())?;
    let token = recommended_stable_token(target_network)
        .ok_or_else(|| "Stable token not configured on target.".to_string())?;

    let verified = match target_network.network_type.as_str() {
        "evm" | "l2" => {
            let rpc = target_network
                .rpc_url
                .as_deref()
                .ok_or_else(|| "Target RPC missing.".to_string())?;
            let result = evm::verify_payout_to_vault(
                rpc,
                payout_tx,
                &entry.vault_address,
                &token.symbol,
                &entry.crypto_amount,
                token.address.as_deref(),
                &target_network.native.symbol,
                target_network.native.decimals,
                token.decimals,
            )
            .await;
            if !result.success {
                return Err(result.reason.unwrap_or_else(|| "Payout verification failed.".into()));
            }
            true
        }
        "algo" => {
            let facilitator = target_network
                .facilitator
                .as_ref()
                .ok_or_else(|| "Algorand facilitator missing.".to_string())?;
            let result = algo::verify_algo_tx(
                &facilitator.url,
                facilitator.indexer_url.as_deref(),
                payout_tx,
                &entry.vault_address,
                &token.symbol,
                &entry.crypto_amount,
                token.asset_id,
                &target_network.native.symbol,
                token.decimals,
            )
            .await;
            if !result.success {
                return Err(result.reason.unwrap_or_else(|| "Algorand payout verification failed.".into()));
            }
            true
        }
        other => return Err(format!("Unsupported settlement target network type: {other}")),
    };

    let _ = verified;

    mark_settled(state, intent_id, payout_tx.to_string(), "cross-chain payout confirmed").await?;
    let data = state.inner.read().await;
    data.ledger
        .iter()
        .find(|e| e.payment_intent_id == intent_id)
        .cloned()
        .ok_or_else(|| "Ledger entry missing after settle.".to_string())
}

pub async fn sweep_intent(
    config: &AppConfig,
    state: &AppState,
    intent_id: &str,
) -> Result<String, String> {
    let entry = {
        let data = state.inner.read().await;
        data.ledger
            .iter()
            .find(|e| e.payment_intent_id == intent_id)
            .cloned()
            .ok_or_else(|| "Ledger entry not found.".to_string())?
    };

    if entry.settlement_status != "sweep_pending" {
        return Err(format!(
            "Entry not in sweep_pending (status={})",
            entry.settlement_status
        ));
    }

    let sweep_tx = sweep::execute_sweep_all(config, &entry).await?;
    if !verify_sweep(config, &entry, &sweep_tx).await {
        return Err("Sweep tx sent but verification failed.".into());
    }
    mark_settled(state, intent_id, sweep_tx.clone(), "manual/admin sweep").await?;
    Ok(sweep_tx)
}

async fn mark_settled(
    state: &AppState,
    intent_id: &str,
    proof_tx: String,
    details: &str,
) -> Result<(), String> {
    let mut data = state.inner.write().await;
    let entry = data
        .ledger
        .iter_mut()
        .find(|e| e.payment_intent_id == intent_id)
        .ok_or_else(|| "Ledger entry not found.".to_string())?;
    entry.settlement_status = "settled".into();
    entry.settlement_proof_tx = Some(proof_tx);
    entry.settled_at = Some(Utc::now().to_rfc3339());
    entry.settlement_details = Some(details.into());
    Ok(())
}

pub fn mock_settlement_proof(chain: &str) -> String {
    if chain == "bsc" || chain == "l2" {
        format!("0x{}", Uuid::new_v4().to_string().replace('-', ""))
    } else {
        format!("ALGO_MOCK_{}", &Uuid::new_v4().to_string()[..8].to_uppercase())
    }
}

pub async fn settlement_queue_async(state: &AppState) -> Vec<LedgerEntry> {
    let data = state.inner.read().await;
    data.ledger
        .iter()
        .filter(|e| {
            e.settlement_status == "pending" || e.settlement_status == "sweep_pending"
        })
        .cloned()
        .collect()
}

mod sweep {
    use crate::config::{get_network_by_id, recommended_stable_token, AppConfig};
    use crate::state::LedgerEntry;
    use ethers::abi::Abi;
    use ethers::contract::Contract;
    use ethers::core::types::{Address, U256};
    use ethers::middleware::SignerMiddleware;
    use ethers::providers::{Http, Provider};
    use ethers::signers::{LocalWallet, Signer};
    use std::sync::Arc;

    pub async fn execute_sweep_all(
        config: &AppConfig,
        entry: &LedgerEntry,
    ) -> Result<String, String> {
        let pk = std::env::var("SWEEP_OPERATOR_PRIVATE_KEY")
            .map_err(|_| "SWEEP_OPERATOR_PRIVATE_KEY not set.".to_string())?;

        let network = get_network_by_id(config, &entry.source_chain)
            .ok_or_else(|| "Source network not found.".to_string())?;
        let rpc = network
            .rpc_url
            .as_deref()
            .ok_or_else(|| "RPC URL missing.".to_string())?;
        let chain_id = network
            .chain_id
            .ok_or_else(|| "chainId missing.".to_string())?;
        let token = recommended_stable_token(network)
            .ok_or_else(|| "Stable token not found.".to_string())?;
        let token_addr: Address = token
            .address
            .as_deref()
            .ok_or_else(|| "Token address missing.".to_string())?
            .parse()
            .map_err(|_| "Invalid token address.".to_string())?;
        let treasury_addr: Address = entry
            .treasury_address
            .parse()
            .map_err(|_| "Invalid treasury address.".to_string())?;

        let provider = Provider::<Http>::try_from(rpc).map_err(|e| e.to_string())?;
        let wallet: LocalWallet = pk
            .parse::<LocalWallet>()
            .map_err(|_| "Invalid SWEEP_OPERATOR_PRIVATE_KEY.".to_string())?
            .with_chain_id(chain_id);

        let client = Arc::new(SignerMiddleware::new(provider, wallet));
        let abi: Abi = serde_json::from_str(
            r#"[{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"sweepAll","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}]"#,
        )
        .map_err(|e| e.to_string())?;

        let contract = Contract::new(treasury_addr, abi, client);
        let call = contract.method::<_, U256>("sweepAll", token_addr).map_err(|e| e.to_string())?;
        let pending = call.send().await.map_err(|e| e.to_string())?;
        let receipt = pending.await.map_err(|e| e.to_string())?.ok_or("No receipt.".to_string())?;
        let hash = format!("{:?}", receipt.transaction_hash);
        Ok(hash)
    }
}
