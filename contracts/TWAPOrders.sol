// SPDX-License-Identifier: 0BSD
pragma solidity ^0.8.17;

import { ICoWSwapSettlement } from "./interfaces/ICoWSwapSettlement.sol";
import { ERC1271_MAGIC_VALUE, IERC1271 } from "./interfaces/IERC1271.sol";
import { IERC20 } from "./interfaces/IERC20.sol";
import { GPv2Order } from "./vendored/GPv2Order.sol";
import { ICoWSwapOnchainOrders } from "./vendored/ICoWSwapOnchainOrders.sol";

contract TWAPOrders is ICoWSwapOnchainOrders {
    using GPv2Order for *;
    using TWAPOrder for *;

    ICoWSwapSettlement immutable public settlement;

    constructor(ICoWSwapSettlement settlement_) {
        settlement = settlement_;
    }

    function place(
        uint256 parts,
        TWAPOrder.Data memory data,
        bytes calldata meta,
        bytes32 salt
    ) external returns (bytes[] memory orderUids) {
        data.receiver = data.receiver == GPv2Order.RECEIVER_SAME_AS_OWNER
            ? msg.sender
            : data.receiver;

        TWAPOrderInstance instance = new TWAPOrderInstance{salt: salt}(
            msg.sender,
            data.sellToken,
            data.hash(),
            settlement
        );

        data.sellToken.transferFrom(
            msg.sender,
            address(instance),
            parts * (data.sellAmount + data.feeAmount)
        );

        orderUids = new bytes[](parts);
        bytes32 domainSeparator = settlement.domainSeparator();
        for (uint256 part = 0; part < parts; part++) {
            GPv2Order.Data memory order = data.orderFor(part);
            OnchainSignature memory signature = OnchainSignature({
                scheme: OnchainSigningScheme.Eip1271,
                data: abi.encode(part, data)
            });
            emit OrderPlacement(address(instance), order, signature, meta);

            orderUids[part] = new bytes(GPv2Order.UID_LENGTH);
            orderUids[part].packOrderUidParams(order.hash(domainSeparator), address(instance), data.validTo);
        }
    }
}

contract TWAPOrderInstance is IERC1271 {
    using GPv2Order for *;
    using TWAPOrder for *;

    uint256 constant private DAY = 60 * 60 * 24;

    bytes32 immutable public domainSeparator;
    address immutable public owner;
    IERC20 immutable public sellToken;
    uint256 immutable public startTime;

    bytes32 public dataHash;

    constructor(
        address owner_,
        IERC20 sellToken_,
        bytes32 dataHash_,
        ICoWSwapSettlement settlement
    ) {
        domainSeparator = settlement.domainSeparator();
        owner = owner_;
        sellToken = sellToken_;
        dataHash = dataHash_;
        startTime = block.timestamp;

        sellToken_.approve(settlement.vaultRelayer(), type(uint256).max);
    }

    function isValidSignature(
        bytes32 hash,
        bytes calldata signature
    ) external view returns (bytes4 magicValue) {
        (uint256 part, TWAPOrder.Data memory data) = abi.decode(signature, (uint256, TWAPOrder.Data));

        require(dataHash == data.hash(), "invalid data");
        require(hash == data.orderFor(part).hash(domainSeparator), "invalid order");

        uint256 validFrom = startTime + part * DAY;
        require(validFrom <= block.timestamp, "too soon");

        magicValue = ERC1271_MAGIC_VALUE;
    }

    function cancel() public {
        require(msg.sender == owner, "not the owner");
        dataHash = bytes32(uint256(1));
        sellToken.transfer(owner, sellToken.balanceOf(address(this)));
    }
}

library TWAPOrder {
    struct Data {
        IERC20 sellToken;
        IERC20 buyToken;
        address receiver;
        uint256 sellAmount;
        uint256 buyAmount;
        uint32 validTo;
        uint256 feeAmount;
    }

    function hash(Data memory self) internal pure returns (bytes32) {
        return keccak256(abi.encode(self));
    }

    function orderFor(Data memory self, uint256 part) internal pure returns (GPv2Order.Data memory order) {
        order = GPv2Order.Data({
            sellToken: self.sellToken,
            buyToken: self.buyToken,
            receiver: self.receiver,
            sellAmount: self.sellAmount,
            buyAmount: self.buyAmount,
            validTo: self.validTo,
            appData: bytes32(part),
            feeAmount: self.feeAmount,
            kind: GPv2Order.KIND_SELL,
            partiallyFillable: false,
            sellTokenBalance: GPv2Order.BALANCE_ERC20,
            buyTokenBalance: GPv2Order.BALANCE_ERC20
        });
    }
}
