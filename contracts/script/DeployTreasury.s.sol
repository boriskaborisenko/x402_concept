// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {X402Treasury} from "../src/X402Treasury.sol";

/// @notice Deploy: VAULT=0x... OPERATOR=0x... forge script script/DeployTreasury.s.sol --rpc-url bsc_testnet --broadcast
contract DeployTreasury is Script {
    function run() external returns (X402Treasury treasury) {
        address vault = vm.envAddress("VAULT");
        address operator = vm.envAddress("OPERATOR");

        vm.startBroadcast();
        treasury = new X402Treasury(vault, operator);
        vm.stopBroadcast();

        console.log("X402Treasury", address(treasury));
        console.log("vault", vault);
        console.log("operator", operator);
    }
}
