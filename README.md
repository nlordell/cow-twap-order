# TWAP Order

A PoC CoW Protocol **T**ime **W**eighted **A**verage **P**ring smart order.

This allows contracts to place TWAP orders at a given limit price, where an order gets released every day.

## Local Development

- `Node.js`: Recommended version 16.x or 18.x
- `npm`: Must be version **8 or newer**

```shell
npx hardhat test
```

In order to run the scripts and place a sample order, first make sure you have an Infura access key and a private key setup:
```shell
export INFURA_PROJECT_ID="..."
export PRIVATE_KEY="0x..."
```

Then you can create orders:
```shell
npx hardhat run scripts/placeOrder.js
```

You can also cancel created orders:
```shell
ORDER_ADDRESS="0x..." npx hardhat run scripts/cancelOrder.js
```
