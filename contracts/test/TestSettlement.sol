// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import { ICoWSwapSettlement } from "../interfaces/ICoWSwapSettlement.sol";

contract TestSettlement is ICoWSwapSettlement {
    function domainSeparator() external pure returns (bytes32) {
        return hex"19175c8f4872b78bf0fdb9dcd005000a0f2d4939399efcfe595eed450de2281c";
    }

    function vaultRelayer() external pure returns (address) {
        return address(uint160(0x1337));
    }
}
