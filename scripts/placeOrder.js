const { ethers } = require("hardhat");
const fetch = require("node-fetch");

const TWAP_ORDERS = "0xaA0e0c2066f9f7C88e22717c6929C26E7d90B518";
const ONE_DAY = 60 * 60 * 24;

const WETH = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6";
const COW = "0x3430d04e42a722c5ae52c5bffbf1f230c2677600";

async function main() {
  const [signer] = await ethers.getSigners();

  const orders = (await ethers.getContractAt("TWAPOrders", TWAP_ORDERS))
    .connect(
      signer,
    );
  const weth = (await ethers.getContractAt("IERC20", WETH)).connect(signer);

  const allowance = await weth.allowance(signer.address, orders.address);
  if (allowance.eq(0)) {
    console.log(`setting allowance ${signer.address} to ${orders.address}`);
    const approval = await weth.approve(
      orders.address,
      ethers.constants.MaxUint256,
    );
    await approval.wait();
  }

  const now = ~~(Date.now() / 1000);
  const parts = 10;
  const order = {
    sellToken: weth.address,
    buyToken: COW,
    receiver: ethers.constants.AddressZero,
    sellAmount: ethers.utils.parseUnits("0.001", 18),
    buyAmount: ethers.utils.parseUnits("10.0", 18),
    validTo: now + (parts + 1) * ONE_DAY,
    feeAmount: ethers.utils.parseUnits("0.0005"),
  };
  const salt = ethers.utils.id("salt");

  console.log(`placing order with ${signer.address}`);
  const placement = await orders.place(parts, order, "0x", salt);
  const receipt = await placement.wait();

  for (
    const { args: onchain } of receipt.events
      .filter(({ event }) => event === "OrderPlacement")
  ) {
    const offchain = {
      from: onchain.sender,
      sellToken: onchain.order.sellToken,
      buyToken: onchain.order.buyToken,
      receiver: onchain.order.receiver,
      sellAmount: onchain.order.sellAmount.toString(),
      buyAmount: onchain.order.buyAmount.toString(),
      validTo: onchain.order.validTo,
      appData: onchain.order.appData,
      feeAmount: onchain.order.feeAmount.toString(),
      kind: "sell",
      partiallyFillable: onchain.order.partiallyFillable,
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20",
      signingScheme: "eip1271",
      signature: onchain.signature.data,
    };

    const response = await fetch(
      `https://barn.api.cow.fi/goerli/api/v1/orders`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(offchain),
      },
    );
    const orderUid = await response.json();

    console.log(orderUid);
  }

  // For local debugging:
  //console.log(`curl -s 'http://localhost:8080/api/v1/orders' -X POST -H 'Content-Type: application/json' --data '${JSON.stringify(offchain)}'`)
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
