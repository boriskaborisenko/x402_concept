use serde_json::Value;

#[derive(Debug)]
pub struct VerifyResult {
    pub success: bool,
    pub reason: Option<String>,
    pub pending: bool,
}

pub async fn verify_algo_tx(
    algod_url: &str,
    indexer_url: Option<&str>,
    tx_hash: &str,
    expected_recipient: &str,
    expected_asset: &str,
    expected_amount: &str,
    expected_asset_id: Option<u64>,
    native_symbol: &str,
    token_decimals: u32,
) -> VerifyResult {
    let client = reqwest::Client::new();

    match fetch_transaction(&client, algod_url, tx_hash).await {
        Ok(Some(tx)) => return verify_transaction_body(
            &tx,
            expected_recipient,
            expected_asset,
            expected_amount,
            expected_asset_id,
            native_symbol,
            token_decimals,
        ),
        Ok(None) => {}
        Err(e) if e.pending => return e.result,
        Err(e) => {
            return e.result;
        }
    }

    let Some(indexer) = indexer_url.filter(|u| !u.is_empty()) else {
        return VerifyResult {
            success: false,
            reason: Some("Transaction not found on Algorand yet.".into()),
            pending: true,
        };
    };

    match fetch_transaction(&client, indexer, tx_hash).await {
        Ok(Some(tx)) => verify_transaction_body(
            &tx,
            expected_recipient,
            expected_asset,
            expected_amount,
            expected_asset_id,
            native_symbol,
            token_decimals,
        ),
        Ok(None) => VerifyResult {
            success: false,
            reason: Some("Transaction not found on Algorand yet.".into()),
            pending: true,
        },
        Err(e) => e.result,
    }
}

struct FetchError {
    pending: bool,
    result: VerifyResult,
}

async fn fetch_transaction(
    client: &reqwest::Client,
    base_url: &str,
    tx_hash: &str,
) -> Result<Option<Value>, FetchError> {
    let url = format!(
        "{}/v2/transactions/{}",
        base_url.trim_end_matches('/'),
        tx_hash
    );

    let response = client.get(&url).send().await.map_err(|e| FetchError {
        pending: false,
        result: VerifyResult {
            success: false,
            reason: Some(format!("Verification node error: {e}")),
            pending: false,
        },
    })?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Err(FetchError {
            pending: false,
            result: VerifyResult {
                success: false,
                reason: Some(format!("Algorand API returned HTTP {}", response.status())),
                pending: false,
            },
        });
    }

    let body: Value = response.json().await.map_err(|e| FetchError {
        pending: false,
        result: VerifyResult {
            success: false,
            reason: Some(format!("Invalid Algorand API response: {e}")),
            pending: false,
        },
    })?;

    Ok(extract_transaction(&body))
}

fn extract_transaction(body: &Value) -> Option<Value> {
    if let Some(tx) = body.get("transaction") {
        return Some(tx.clone());
    }
    if let Some(tx) = body.get("txn") {
        return Some(tx.clone());
    }
    if body.get("tx-type").is_some() || body.get("type").is_some() {
        return Some(body.clone());
    }
    None
}

fn tx_type(tx: &Value) -> Option<&str> {
    tx.get("type")
        .or_else(|| tx.get("tx-type"))
        .and_then(|v| v.as_str())
}

fn verify_transaction_body(
    tx: &Value,
    expected_recipient: &str,
    expected_asset: &str,
    expected_amount: &str,
    expected_asset_id: Option<u64>,
    native_symbol: &str,
    token_decimals: u32,
) -> VerifyResult {
    let expected_micro = (expected_amount.parse::<f64>().unwrap_or(0.0)
        * 10f64.powi(token_decimals as i32)) as u64;

    let kind = tx_type(tx).unwrap_or_default();

    if expected_asset == native_symbol {
        if kind != "pay" {
            return fail(format!("Expected native transfer, got '{kind}'."));
        }
        let receiver = tx
            .pointer("/payment-transaction/receiver")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let amount = tx
            .pointer("/payment-transaction/amount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if receiver != expected_recipient {
            return fail("Receiver mismatch.");
        }
        if amount < expected_micro {
            return fail("Amount mismatch.");
        }
    } else if let Some(asset_id) = expected_asset_id {
        if kind != "axfer" {
            return fail(format!("Expected ASA transfer, got '{kind}'."));
        }
        let tx_asset = tx
            .pointer("/asset-transfer-transaction/asset-id")
            .and_then(|v| v.as_u64());
        let receiver = tx
            .pointer("/asset-transfer-transaction/receiver")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let amount = tx
            .pointer("/asset-transfer-transaction/amount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if tx_asset != Some(asset_id) {
            return fail(format!(
                "Asset ID mismatch. Expected {asset_id}, got {:?}",
                tx_asset
            ));
        }
        if receiver != expected_recipient {
            return fail("Receiver mismatch.");
        }
        if amount < expected_micro {
            return fail("Amount mismatch.");
        }
    } else {
        return fail("Unsupported asset route.");
    }

    let confirmed = tx
        .get("confirmed-round")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if confirmed == 0 {
        return VerifyResult {
            success: false,
            reason: Some("Transaction not yet confirmed in a block.".into()),
            pending: true,
        };
    }

    VerifyResult {
        success: true,
        reason: None,
        pending: false,
    }
}

fn fail(reason: impl Into<String>) -> VerifyResult {
    VerifyResult {
        success: false,
        reason: Some(reason.into()),
        pending: false,
    }
}

pub async fn asa_balance(
    algod_url: &str,
    indexer_url: Option<&str>,
    address: &str,
    asset_id: u64,
    decimals: u32,
) -> Option<String> {
    let client = reqwest::Client::new();
    let idx = indexer_url.unwrap_or(algod_url);
    let url = format!("{idx}/v2/accounts/{address}");
    let account = client.get(&url).send().await.ok()?.json::<serde_json::Value>().await.ok()?;
    let assets = account
        .pointer("/account/assets")
        .and_then(|a| a.as_array())?;

    for asset in assets {
        if asset.get("asset-id").and_then(|v| v.as_u64()) == Some(asset_id) {
            let amount = asset.get("amount").and_then(|v| v.as_u64()).unwrap_or(0);
            return Some(format_asa_amount(amount, decimals));
        }
    }
    Some(format_asa_amount(0, decimals))
}

fn format_asa_amount(amount: u64, decimals: u32) -> String {
    let scale = 10u64.pow(decimals);
    let whole = amount / scale;
    let frac = amount % scale;
    format!("{whole}.{frac:0width$}", width = decimals as usize)
}
