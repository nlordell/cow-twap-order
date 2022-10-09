const { ethers } = require("hardhat");

function dataTuple(data) {
  return [
    data.sellToken,
    data.buyToken,
    data.receiver,
    data.sellAmount,
    data.buyAmount,
    data.validTo,
    data.feeAmount,
  ];
}

function hashData(data) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["(address, address, address, uint256, uint256, uint32, uint256)"],
      [dataTuple(data)],
    ),
  );
}

function normalizeData(data, owner) {
  return {
    ...data,
    receiver: data.receiver == ethers.constants.AddressZero
      ? (owner ?? ethers.constants.AddressZero)
      : data.receiver,
  };
}

function encodeSignature(part, data, owner) {
  return ethers.utils.defaultAbiCoder.encode(
    [
      "uint256",
      "(address, address, address, uint256, uint256, uint32, uint256)",
    ],
    [part, dataTuple(normalizeData(data, owner))],
  );
}

function testDomain() {
  return { name: "Test" };
}

function getOrder(part, data, owner) {
  const normalized = normalizeData(data, owner);
  return {
    sellToken: normalized.sellToken,
    buyToken: normalized.buyToken,
    receiver: normalized.receiver,
    sellAmount: normalized.sellAmount,
    buyAmount: normalized.buyAmount,
    validTo: normalized.validTo,
    appData: ethers.utils.defaultAbiCoder.encode(["uint256"], [part]),
    feeAmount: normalized.feeAmount,
    kind: "sell",
    partiallyFillable: false,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
  };
}

function getOrderHash(part, data, owner) {
  return ethers.utils._TypedDataEncoder.hash(
    testDomain(),
    {
      Order: [
        { name: "sellToken", type: "address" },
        { name: "buyToken", type: "address" },
        { name: "receiver", type: "address" },
        { name: "sellAmount", type: "uint256" },
        { name: "buyAmount", type: "uint256" },
        { name: "validTo", type: "uint32" },
        { name: "appData", type: "bytes32" },
        { name: "feeAmount", type: "uint256" },
        { name: "kind", type: "string" },
        { name: "partiallyFillable", type: "bool" },
        { name: "sellTokenBalance", type: "string" },
        { name: "buyTokenBalance", type: "string" },
      ],
    },
    getOrder(part, data, owner),
  );
}

function deepEventEq(data) {
  return (event) => {
    return Object.entries(data).every(([key, value]) => {
      const ev = event[key];
      if (ethers.BigNumber.isBigNumber(ev)) {
        return ev.eq(value);
      }
      return ev === value;
    });
  };
}

module.exports = {
  deepEventEq,
  encodeSignature,
  getOrder,
  getOrderHash,
  hashData,
  testDomain,
};
