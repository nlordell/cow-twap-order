const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  encodeSignature,
  getOrderHash,
  hashData,
  testDomain,
} = require("./util.js");

const ERC1271_MAGIC_VALUE = "0x1626ba7e";
const ONE_DAY = 60 * 60 * 24;

describe("TWAPOrderInstance", function () {
  async function fixture() {
    const [_deployer, owner, bob] = await ethers.getSigners();

    const TestERC20 = await ethers.getContractFactory("TestERC20");
    const sellToken = await TestERC20.deploy();

    const parts = 30;
    const data = {
      sellToken: sellToken.address,
      buyToken: "0x0101010101010101010101010101010101010101",
      receiver: owner.address,
      sellAmount: ethers.utils.parseUnits("1.0", 18),
      buyAmount: ethers.utils.parseUnits("2.0", 18),
      validTo: 0x12345678,
      feeAmount: ethers.utils.parseUnits("0.01", 18),
    };

    const TestSettlement = await ethers.getContractFactory("TestSettlement");
    const settlement = await TestSettlement.deploy();

    const TWAPOrderInstance = await ethers.getContractFactory(
      "TWAPOrderInstance",
    );
    const dataHash = hashData(data);
    const order = await TWAPOrderInstance.deploy(
      owner.address,
      sellToken.address,
      dataHash,
      settlement.address,
    );

    await sellToken.mint(
      order.address,
      data.sellAmount.add(data.feeAmount).mul(parts),
    );

    return {
      owner,
      sellToken,
      parts,
      data,
      dataHash,
      settlement,
      order,
      bob,
    };
  }

  describe("constructor", function () {
    it("Should set the contract values", async function () {
      const {
        owner,
        sellToken,
        dataHash,
        settlement,
        order,
      } = await loadFixture(fixture);

      expect(await order.domainSeparator()).to.equal(
        ethers.utils._TypedDataEncoder.hashDomain(testDomain()),
      );

      expect(await order.domainSeparator())
        .to.equal(await settlement.domainSeparator());
      expect(await order.owner()).to.equal(owner.address);
      expect(await order.sellToken()).to.equal(sellToken.address);
      expect(await order.startTime()).to.not.equal(0);
      expect(await order.dataHash()).to.equal(dataHash);
    });

    it("Should set approval to vault relayer", async function () {
      const { sellToken, settlement, order } = await loadFixture(fixture);

      expect(
        await sellToken.allowance(
          order.address,
          await settlement.vaultRelayer(),
        ),
      ).to.equal(ethers.constants.MaxUint256);
    });
  });

  describe("isValidSignature", function () {
    it("Should validate for correct data hash once matured", async function () {
      const { data, order } = await loadFixture(fixture);

      const orderHash = getOrderHash(0, data);
      const signature = encodeSignature(0, data);

      expect(await order.isValidSignature(orderHash, signature)).to.equal(
        ERC1271_MAGIC_VALUE,
      );
    });

    it("Should validate next part after one day", async function () {
      const { data, order } = await loadFixture(fixture);

      const orderHash = getOrderHash(1, data);
      const signature = encodeSignature(1, data);

      await expect(order.isValidSignature(orderHash, signature)).to.be
        .revertedWith("too soon");

      await time.increaseTo(await time.latest() + ONE_DAY);

      expect(await order.isValidSignature(orderHash, signature)).to.equal(
        ERC1271_MAGIC_VALUE,
      );

      const nextOrderHash = getOrderHash(2, data);
      const nextSignature = encodeSignature(2, data);

      await expect(order.isValidSignature(nextOrderHash, nextSignature)).to.be
        .revertedWith("too soon");
    });

    it("Should revert when data hash doesn't match", async function () {
      const { data, order } = await loadFixture(fixture);

      const changedData = { ...data, sellAmount: data.sellAmount.add(1) };
      const orderHash = getOrderHash(0, changedData);
      const signature = encodeSignature(0, changedData);

      await expect(order.isValidSignature(orderHash, signature)).to.be
        .revertedWith("invalid data");
    });

    it("Should revert if the order hash does not match", async function () {
      const { data, order } = await loadFixture(fixture);

      const orderHash = getOrderHash(1, data);
      const signature = encodeSignature(0, data);

      await expect(order.isValidSignature(orderHash, signature)).to.be
        .revertedWith("invalid order");
    });
  });

  describe("cancel", function () {
    it("Should transfer balance to owner", async function () {
      const {
        owner,
        sellToken,
        parts,
        data,
        order,
      } = await loadFixture(fixture);

      const fullAmount = data.sellAmount.add(data.feeAmount).mul(parts);

      expect(await sellToken.balanceOf(order.address)).to.equal(fullAmount);
      expect(await sellToken.balanceOf(owner.address)).to.equal(0);

      await order.connect(owner).cancel();

      expect(await sellToken.balanceOf(order.address)).to.equal(0);
      expect(await sellToken.balanceOf(owner.address)).to.equal(fullAmount);
    });

    it("Should unset data hash", async function () {
      const { owner, order } = await loadFixture(fixture);

      await order.connect(owner).cancel();

      expect(await order.dataHash()).to.equal(
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      );
    });

    it("Should revert if not called by owner", async function () {
      const { owner, order, bob } = await loadFixture(fixture);

      expect(owner.address).to.not.eq(bob.address);

      await expect(order.connect(bob).cancel()).to.be.revertedWith(
        "not the owner",
      );
    });
  });
});
