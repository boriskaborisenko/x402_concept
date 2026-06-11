use crate::config::AppConfig;
use crate::state::AppState;
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

async fn process_pending_settlements(
    config: &AppConfig,
    state: &AppState,
) -> Result<(), String> {
    let mut data = state.inner.write().await;
    let vault = config
        .settlement
        .as_ref()
        .and_then(|s| s.vault.as_ref())
        .map(|v| v.address.clone())
        .unwrap_or_else(|| "vault".into());

    let mut processed = 0usize;
    for entry in data.ledger.iter_mut() {
        if entry.settlement_status != "pending" {
            continue;
        }
        let payout_tx = mock_settlement_proof(&entry.source_chain);
        entry.settlement_status = "settled".into();
        processed += 1;
        tracing::info!(
            "Settlement mock: {} → vault {} (payout_tx: {payout_tx})",
            entry.payment_intent_id,
            vault
        );
    }

    if processed > 0 {
        tracing::info!("Settlement worker processed {processed} entries");
    }
    Ok(())
}

pub fn mock_settlement_proof(chain: &str) -> String {
    if chain == "bsc" || chain == "l2" {
        format!("0x{}", Uuid::new_v4().to_string().replace('-', ""))
    } else {
        format!("ALGO_MOCK_{}", &Uuid::new_v4().to_string()[..8].to_uppercase())
    }
}
