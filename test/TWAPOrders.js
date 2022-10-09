const {
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  deepEventEq,
  encodeSignature,
  getOrder,
  getOrderHash,
} = require("./util.js");

describe("TWAPOrders", function () {
  async function fixture() {
    const [_deployer, owner] = await ethers.getSigners();

    const TestSettlement = await ethers.getContractFactory("TestSettlement");
    const settlement = await TestSettlement.deploy();

    const TWAPOrders = await ethers.getContractFactory("TWAPOrders");
    const orders = await TWAPOrders.deploy(settlement.address);

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const sellToken = await TestERC20.deploy();
    const buyToken = await TestERC20.deploy();

    const parts = 30;
    const sellAmount = ethers.utils.parseUnits("1.0", 18);
    const feeAmount = ethers.utils.parseUnits("0.01", 18);
    await sellToken.mint(owner.address, sellAmount.add(feeAmount).mul(parts));

    return {
      settlement,
      orders,
      owner,
      sellToken,
      buyToken,
      parts,
      sellAmount,
      feeAmount,
    };
  }

  describe("constructor", function () {
    it("Should set the contract values", async function () {
      const { settlement, orders } = await loadFixture(fixture);

      expect(await orders.settlement()).to.equal(settlement.address);
    });
  });

  describe("place", function () {
    it("Should create a TWAP order", async function () {
      const {
        orders,
        owner,
        sellToken,
        buyToken,
        parts,
        sellAmount,
        feeAmount,
      } = await loadFixture(fixture);

      const data = {
        sellToken: sellToken.address,
        buyToken: buyToken.address,
        receiver: ethers.constants.AddressZero,
        sellAmount,
        buyAmount: ethers.utils.parseUnits("1.0", 6),
        validTo: 0xffffffff,
        feeAmount,
      };
      const meta = "0x";
      const salt = ethers.utils.id("salt");

      await sellToken.connect(owner).approve(
        orders.address,
        ethers.constants.MaxUint256,
      );
      const orderUids = await orders
        .connect(owner)
        .callStatic.place(parts, data, meta, salt);
      const instance = ethers.utils.getAddress(
        ethers.utils.hexDataSlice(orderUids[0], 32, 52),
      );

      await expect(orders.connect(owner).place(parts, data, meta, salt))
        .to.emit(orders, "OrderPlacement")
        .withArgs(
          instance,
          deepEventEq({
            ...getOrder(0, data, owner.address),
            kind: ethers.utils.id("sell"),
            sellTokenBalance: ethers.utils.id("erc20"),
            buyTokenBalance: ethers.utils.id("erc20"),
          }),
          deepEventEq({
            scheme: 0,
            data: encodeSignature(0, data, owner.address),
          }),
          "0x",
        );

      for (let part = 0; part < parts; part++) {
        const orderHash = getOrderHash(part, data, owner.address);
        expect(orderUids[part]).to.eq(
          ethers.utils.solidityPack(
            ["bytes32", "address", "uint32"],
            [orderHash, instance, data.validTo],
          ),
        );
      }
    });

    it("Should transfer out sell plus fee amounts for each part", async function () {
      const {
        orders,
        owner,
        sellToken,
        buyToken,
        parts,
        sellAmount,
        feeAmount,
      } = await loadFixture(fixture);

      const data = {
        sellToken: sellToken.address,
        buyToken: buyToken.address,
        receiver: ethers.constants.AddressZero,
        sellAmount,
        buyAmount: ethers.utils.parseUnits("1.0", 6),
        validTo: 0xffffffff,
        feeAmount,
      };
      const meta = "0x";
      const salt = ethers.utils.id("salt");

      await sellToken.connect(owner).approve(
        orders.address,
        ethers.constants.MaxUint256,
      );
      const orderUids = await orders
        .connect(owner)
        .callStatic.place(parts, data, meta, salt);
      const instance = ethers.utils.getAddress(
        ethers.utils.hexDataSlice(orderUids[0], 32, 52),
      );

      const fullAmount = sellAmount.add(feeAmount).mul(parts);

      expect(await sellToken.balanceOf(owner.address)).to.equal(fullAmount);
      expect(await sellToken.balanceOf(instance)).to.equal(0);

      await orders.connect(owner).place(parts, data, meta, salt);

      expect(await sellToken.balanceOf(owner.address)).to.equal(0);
      expect(await sellToken.balanceOf(instance)).to.equal(fullAmount);
    });
  });
});
