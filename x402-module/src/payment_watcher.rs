use crate::authorization::{get_mock_resource, verify_route_payment, VerifyOutcome};
use crate::config::AppConfig;
use crate::state::{AppState, PaymentJob};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

const POLL_INTERVAL_MS: u64 = 1500;
const MAX_ATTEMPTS: u32 = 60;

pub async fn submit_payment_job(
    config: Arc<AppConfig>,
    state: AppState,
    intent_id: String,
    tx_hash: String,
    route_id: String,
) -> Result<(), String> {
    {
        let mut data = state.inner.write().await;
        if !data.payment_intents.contains_key(&intent_id) {
            return Err("Payment Intent not found.".into());
        }
        if data.payment_jobs.get(&intent_id).map(|j| j.status.as_str()) == Some("running") {
            return Ok(());
        }
        data.payment_jobs.insert(
            intent_id.clone(),
            PaymentJob {
                tx_hash: tx_hash.clone(),
                route_id: route_id.clone(),
                status: "running".into(),
                attempts: 0,
            },
        );
    }

    let _ = state.events.send(crate::state::PaymentEventEnvelope {
        intent_id: intent_id.clone(),
        event: json!({ "type": "payment_submitted", "txHash": tx_hash }),
    });

    tokio::spawn(async move {
        run_payment_watcher(config, state, intent_id).await;
    });

    Ok(())
}

async fn run_payment_watcher(config: Arc<AppConfig>, state: AppState, intent_id: String) {
    for _ in 0..MAX_ATTEMPTS {
        let (tx_hash, route_id) = {
            let data = state.inner.read().await;
            let job = match data.payment_jobs.get(&intent_id) {
                Some(j) => j.clone(),
                None => return,
            };
            (job.tx_hash.clone(), job.route_id.clone())
        };

        {
            let mut data = state.inner.write().await;
            if let Some(job) = data.payment_jobs.get_mut(&intent_id) {
                job.attempts += 1;
            }
        }

        let outcome = {
            let mut data = state.inner.write().await;
            verify_route_payment(&config, &mut data, &intent_id, &tx_hash, &route_id).await
        };

        match outcome {
            VerifyOutcome::Success(content) | VerifyOutcome::AlreadyUnlocked(content) => {
                let _ = state.events.send(crate::state::PaymentEventEnvelope {
                    intent_id: intent_id.clone(),
                    event: json!({ "type": "payment_verified", "access": "unlocked" }),
                });
                let _ = state.events.send(crate::state::PaymentEventEnvelope {
                    intent_id: intent_id.clone(),
                    event: json!({ "type": "resource_unlocked", "resourceContent": content }),
                });
                let mut data = state.inner.write().await;
                if let Some(job) = data.payment_jobs.get_mut(&intent_id) {
                    job.status = "verified".into();
                }
                return;
            }
            VerifyOutcome::Failed {
                pending: true,
                confirmations,
                ..
            } => {
                let _ = state.events.send(crate::state::PaymentEventEnvelope {
                    intent_id: intent_id.clone(),
                    event: json!({ "type": "payment_confirming", "confirmations": confirmations.unwrap_or(0) }),
                });
                tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
            }
            VerifyOutcome::Failed { reason, .. } => {
                let _ = state.events.send(crate::state::PaymentEventEnvelope {
                    intent_id: intent_id.clone(),
                    event: json!({ "type": "payment_failed", "reason": reason }),
                });
                return;
            }
            VerifyOutcome::Error(reason) => {
                let _ = state.events.send(crate::state::PaymentEventEnvelope {
                    intent_id: intent_id.clone(),
                    event: json!({ "type": "payment_failed", "reason": reason }),
                });
                return;
            }
        }
    }

    let _ = state.events.send(crate::state::PaymentEventEnvelope {
        intent_id,
        event: json!({
            "type": "payment_failed",
            "reason": "Verification timed out. Transaction may still confirm later."
        }),
    });
}

pub async fn replay_unlocked_if_ready(state: &AppState, intent_id: &str) -> Vec<serde_json::Value> {
    let data = state.inner.read().await;
    let intent = match data.payment_intents.get(intent_id) {
        Some(i) if i.status == "access_unlocked" => i,
        _ => return vec![],
    };
    let content = get_mock_resource(&intent.resource_id);
    vec![
        json!({ "type": "payment_verified", "access": "unlocked" }),
        json!({ "type": "resource_unlocked", "resourceContent": content }),
    ]
}
