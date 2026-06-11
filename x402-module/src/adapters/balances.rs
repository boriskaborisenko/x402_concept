use crate::config::{get_enabled_networks, recommended_stable_token, settlement_target, AppConfig};
use crate::adapters::{algo, evm};
use serde_json::{json, Value};

pub async fn fetch_balances(config: &AppConfig) -> Value {
    let (target_id, vault) = match settlement_target(config) {
        Some((t, v)) => (t, v),
        None => {
            return json!({
                "error": "settlement.vault not configured",
                "treasuries": [],
            });
        }
    };

    let mut treasuries = Vec::new();

    for network in get_enabled_networks(config) {
        let stable = recommended_stable_token(network);
        let mut row = json!({
            "networkId": network.id,
            "address": network.treasury.address,
            "treasuryType": network.treasury.treasury_type,
        });

        match network.network_type.as_str() {
            "evm" | "l2" => {
                if let (Some(rpc), Some(token)) = (
                    network.rpc_url.as_deref(),
                    stable,
                ) {
                    if let Some(addr) = token.address.as_deref() {
                        if let Some(bal) =
                            evm::erc20_balance_of(rpc, addr, &network.treasury.address).await
                        {
                            row["stableBalance"] = json!(bal);
                            row["stableSymbol"] = json!(token.symbol);
                        }
                    }
                }
            }
            "algo" => {
                if let (Some(f), Some(token)) = (
                    network.facilitator.as_ref(),
                    stable,
                ) {
                    if let Some(bal) = algo::asa_balance(
                        &f.url,
                        f.indexer_url.as_deref(),
                        &network.treasury.address,
                        token.asset_id.unwrap_or(0),
                        token.decimals,
                    )
                    .await
                    {
                        row["stableBalance"] = json!(bal);
                        row["stableSymbol"] = json!(token.symbol);
                    }
                }
            }
            _ => {}
        }
        treasuries.push(row);
    }

    let mut vault_row = json!({
        "networkId": vault.network_id,
        "address": vault.address,
        "type": vault.vault_type,
    });

    if let Some(network) = get_enabled_networks(config)
        .into_iter()
        .find(|n| n.id == target_id)
    {
        if network.network_type == "evm" || network.network_type == "l2" {
            if let (Some(rpc), Some(token)) = (
                network.rpc_url.as_deref(),
                recommended_stable_token(network),
            ) {
                if let Some(addr) = token.address.as_deref() {
                    if let Some(bal) = evm::erc20_balance_of(rpc, addr, &vault.address).await {
                        vault_row["stableBalance"] = json!(bal);
                        vault_row["stableSymbol"] = json!(token.symbol);
                    }
                }
            }
        } else if network.network_type == "algo" {
            if let (Some(f), Some(token)) = (
                network.facilitator.as_ref(),
                recommended_stable_token(network),
            ) {
                if let Some(bal) = algo::asa_balance(
                    &f.url,
                    f.indexer_url.as_deref(),
                    &vault.address,
                    token.asset_id.unwrap_or(0),
                    token.decimals,
                )
                .await
                {
                    vault_row["stableBalance"] = json!(bal);
                    vault_row["stableSymbol"] = json!(token.symbol);
                }
            }
        }
    }

    json!({
        "targetNetworkId": target_id,
        "settlementMode": config.settlement.as_ref().and_then(|s| s.mode.clone()),
        "vault": vault_row,
        "treasuries": treasuries,
        "note": "Use /admin/settlement/queue for pending entries"
    })
}
