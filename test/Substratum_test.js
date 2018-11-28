/* global web3, require, artifacts, contract, before, describe, it */

const BigNumber = web3.BigNumber
const Web3 = require('web3')
const newWeb3 = new Web3(Web3.givenProvider || 'ws://localhost:8545')

const chai = require('chai')
chai.use(require('chai-bignumber')(BigNumber))
chai.use(require('dirty-chai'))
const expect = chai.expect
const truffleAssert = require('truffle-assertions')

const reverted = require('./helpers/reverted')
const toWei = require('./helpers/toWei')

const Substratum = artifacts.require('Substratum')

const INITIAL_WEI_SUPPLY = new BigNumber('472e24')
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('Substratum', ([owner, otherAccount, buyer, seller]) => {
  let subject
  let SubstratumNewWeb3

  before(async () => {
    subject = await Substratum.new({ from: owner })
    SubstratumNewWeb3 = new newWeb3.eth.Contract(subject.abi, subject.address)
  })

  describe('deployed contract', () => {
    it('has the name Substratum', async () => {
      expect(await subject.name()).to.equal('Substratum')
    })

    it('has the symbol SUB', async () => {
      expect(await subject.symbol()).to.equal('SUB')
    })

    it('has 18 decimal precision', async () => {
      expect((await subject.decimals()).toNumber()).to.equal(18)
    })

    it('starts with a total supply of 472 million', async () => {
      expect(await subject.totalSupply()).to.be.bignumber.equal(toWei('472e6'))
    })

    it('starts with owner balance at 472 million', async () => {
      expect(await subject.balanceOf(owner)).to.be.bignumber.equal(toWei('472e6'))
    })

    it('emits an event for token creation', async () => {
      let events = await SubstratumNewWeb3.getPastEvents('Transfer')
      const eventArgs = events[0].returnValues

      expect(eventArgs.from.valueOf()).to.equal(ZERO_ADDRESS)
      expect(eventArgs.to.valueOf().toLowerCase()).to.equal(owner)
      expect(eventArgs.value).to.be.bignumber.equal(INITIAL_WEI_SUPPLY)
    })

    it('should reject receiving ETH to the fallback function', async () => {
      expect(await reverted(subject.sendTransaction({ value: 1 }))).to.be.true()
    })
  })

  describe('token burn', () => {
    it('cannot burn more than owner has', async () => {
      const initialOwnerAmount = await subject.balanceOf(owner)
      const transferAmount = initialOwnerAmount.dividedBy(2)
      await subject.transfer(otherAccount, transferAmount)
      const expectedOwnerAmount = await subject.balanceOf(owner)
      const amountToBurn = initialOwnerAmount.plus(1)

      expect(await reverted(subject.burn(amountToBurn))).to.be.true()

      expect(await subject.balanceOf(owner)).to.be.bignumber.equal(expectedOwnerAmount)
      expect(await subject.totalSupply()).to.be.bignumber.equal(INITIAL_WEI_SUPPLY)
    })

    it('can burn an amount that owner has', async () => {
      const initialTotalSupply = await subject.totalSupply()
      const initialOwnerAmount = await subject.balanceOf(owner)
      const burntAmount = 750
      const tx = await subject.burn(burntAmount)

      truffleAssert.eventEmitted(tx, 'Transfer', event => {
        return event.from === owner &&
          event.to === ZERO_ADDRESS &&
          event.value.eq(burntAmount)
      })

      expect(await subject.balanceOf(owner)).to.be.bignumber.equal(initialOwnerAmount.minus(burntAmount))
      expect(await subject.totalSupply()).to.be.bignumber.equal(initialTotalSupply.minus(burntAmount))
    })
  })

  describe('contract', async () => {
    it('allows transfers from any account', async () => {
      const initialOwnerAmount = await subject.balanceOf(owner)
      const initialOtherAmount = await subject.balanceOf(otherAccount)
      const transferAmount = 600

      await subject.transfer(owner, transferAmount, { from: otherAccount })

      expect(await subject.balanceOf(otherAccount)).to.be.bignumber.equal(initialOtherAmount.minus(transferAmount))
      expect(await subject.balanceOf(owner)).to.be.bignumber.equal(initialOwnerAmount.plus(transferAmount))
    })

    it('does not allow transferring more than the balance', async () => {
      expect(await reverted(subject.transfer(owner, 1, { from: otherAccount })))
    })

    it('can transfer approved funds', async () => {
      const initialOwnerBalance = await subject.balanceOf(owner)
      const initialSellerBalance = await subject.balanceOf(seller)
      const transferAmount = 10000
      await subject.approve(buyer, transferAmount)
      await subject.transferFrom(owner, seller, transferAmount, { from: buyer })

      expect(await subject.balanceOf(seller)).to.be.bignumber.equal(initialSellerBalance.plus(transferAmount))
      expect(await subject.balanceOf(owner)).to.be.bignumber.equal(initialOwnerBalance.minus(transferAmount))
    })

    it('can transfer approved funds in chunks', async () => {
      let initialOwnerBalance = await subject.balanceOf(owner)
      const initialSellerBalance = await subject.balanceOf(seller)
      const totalTransferAmount = 10000
      await subject.approve(buyer, totalTransferAmount, { from: owner })
      await subject.transferFrom(owner, seller, 4000, { from: buyer })
      await subject.transferFrom(owner, seller, 6000, { from: buyer })

      expect(await subject.balanceOf(seller)).to.be.bignumber.equal(initialSellerBalance.plus(totalTransferAmount))
      expect(await subject.balanceOf(owner)).to.be.bignumber.equal(initialOwnerBalance.minus(totalTransferAmount))
    })

    it('can not transfer funds that have not been approved', async () => {
      expect(await reverted(subject.transferFrom(owner, seller, 20000, { from: buyer }))).to.be.true()
    })

    it('can not do the transfer if not enough has been approved', async () => {
      await subject.approve(buyer, 10000, { from: owner })
      expect(await reverted(subject.transferFrom(owner, seller, 200000, { from: buyer }))).to.be.true()
    })

    it('can not transfer approved funds if balance is too low', async () => {
      let balance = await subject.balanceOf(owner)
      await subject.approve(buyer, 0, { from: owner })
      await subject.approve(buyer, balance, { from: owner })

      await subject.transfer(otherAccount, balance / 2, { from: owner })
      expect(await reverted(subject.transferFrom(owner, seller, balance, { from: buyer }))).to.be.true()
    })

    it('reverts 2nd non-zero approve calls to prevent double-spend race condition', async () => {
      let approvedAmount = 10000
      let spender = buyer

      await subject.approve(spender, 0, { from: owner })
      await subject.approve(spender, approvedAmount, { from: owner })
      expect(await subject.allowance(owner, spender)).to.be.bignumber.equal(approvedAmount)

      expect(await reverted(subject.approve(spender, approvedAmount, { from: owner }))).to.be.true()
      expect(await subject.allowance(owner, spender)).to.be.bignumber.equal(approvedAmount)
    })
  })
})
