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

const OldSubstratum = artifacts.require('MyAdvancedToken')
const NewSubstratum = artifacts.require('Substratum')

const INITIAL_WEI_SUPPLY = new BigNumber('472e24')
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

contract('Substratum', ([owner, otherAccount, buyer, seller, user]) => {
  let newSub, oldSub
  let SubstratumNewWeb3

  describe('can not create the new contract specifying a zero address for the legacy token', () => {
    it('rejects the contract creation', async () => {
      expect(await reverted(NewSubstratum.new(ZERO_ADDRESS, { from: owner }))).to.be.true()
    })
  })

  describe('deployed contract', () => {
    before(async () => {
      oldSub = await OldSubstratum.new(59200000000, 'Substratum', 2, 'SUB', { from: owner })
      newSub = await NewSubstratum.new(oldSub.address, { from: owner })
      SubstratumNewWeb3 = new newWeb3.eth.Contract(newSub.abi, newSub.address)
    })

    it('has the name Substratum', async () => {
      expect(await newSub.name()).to.equal('Substratum')
    })

    it('has the symbol SUB', async () => {
      expect(await newSub.symbol()).to.equal('SUB')
    })

    it('has 18 decimal precision', async () => {
      expect((await newSub.decimals()).toNumber()).to.equal(18)
    })

    it('starts with a total supply of 472 million', async () => {
      expect(await newSub.totalSupply()).to.be.bignumber.equal(toWei('472e6'))
    })

    it('starts with owner balance at 472 million', async () => {
      expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(toWei('472e6'))
    })

    it('emits an event for token creation', async () => {
      let events = await SubstratumNewWeb3.getPastEvents('Transfer')
      const eventArgs = events[0].returnValues

      expect(eventArgs.from.valueOf()).to.equal(ZERO_ADDRESS)
      expect(eventArgs.to.valueOf().toLowerCase()).to.equal(owner)
      expect(eventArgs.value).to.be.bignumber.equal(INITIAL_WEI_SUPPLY)
    })

    it('should reject receiving ETH to the fallback function', async () => {
      expect(await reverted(newSub.sendTransaction({ value: 1 }))).to.be.true()
    })
  })

  describe('token burn', () => {
    it('cannot burn more than owner has', async () => {
      const initialOwnerAmount = await newSub.balanceOf(owner)
      const transferAmount = initialOwnerAmount.dividedBy(2)
      await newSub.transfer(otherAccount, transferAmount)
      const expectedOwnerAmount = await newSub.balanceOf(owner)
      const amountToBurn = initialOwnerAmount.plus(1)

      expect(await reverted(newSub.burn(amountToBurn))).to.be.true()

      expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(expectedOwnerAmount)
      expect(await newSub.totalSupply()).to.be.bignumber.equal(INITIAL_WEI_SUPPLY)
    })

    it('can burn an amount that owner has', async () => {
      const initialTotalSupply = await newSub.totalSupply()
      const initialOwnerAmount = await newSub.balanceOf(owner)
      const burntAmount = 750
      const tx = await newSub.burn(burntAmount)

      truffleAssert.eventEmitted(tx, 'Transfer', event => {
        return event.from === owner &&
          event.to === ZERO_ADDRESS &&
          event.value.eq(burntAmount)
      })

      expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(initialOwnerAmount.minus(burntAmount))
      expect(await newSub.totalSupply()).to.be.bignumber.equal(initialTotalSupply.minus(burntAmount))
    })
  })

  describe('contract', async () => {
    it('allows transfers from any account', async () => {
      const initialOwnerAmount = await newSub.balanceOf(owner)
      const initialOtherAmount = await newSub.balanceOf(otherAccount)
      const transferAmount = 600

      await newSub.transfer(owner, transferAmount, { from: otherAccount })

      expect(await newSub.balanceOf(otherAccount)).to.be.bignumber.equal(initialOtherAmount.minus(transferAmount))
      expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(initialOwnerAmount.plus(transferAmount))
    })

    it('does not allow transferring more than the balance', async () => {
      expect(await reverted(newSub.transfer(owner, 1, { from: otherAccount })))
    })

    it('can transfer approved funds', async () => {
      const initialOwnerBalance = await newSub.balanceOf(owner)
      const initialSellerBalance = await newSub.balanceOf(seller)
      const transferAmount = 10000
      await newSub.approve(buyer, transferAmount)
      await newSub.transferFrom(owner, seller, transferAmount, { from: buyer })

      expect(await newSub.balanceOf(seller)).to.be.bignumber.equal(initialSellerBalance.plus(transferAmount))
      expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(initialOwnerBalance.minus(transferAmount))
    })

    it('can transfer approved funds in chunks', async () => {
      let initialOwnerBalance = await newSub.balanceOf(owner)
      const initialSellerBalance = await newSub.balanceOf(seller)
      const totalTransferAmount = 10000
      await newSub.approve(buyer, totalTransferAmount, { from: owner })
      await newSub.transferFrom(owner, seller, 4000, { from: buyer })
      await newSub.transferFrom(owner, seller, 6000, { from: buyer })

      expect(await newSub.balanceOf(seller)).to.be.bignumber.equal(initialSellerBalance.plus(totalTransferAmount))
      expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(initialOwnerBalance.minus(totalTransferAmount))
    })

    it('can not transfer funds that have not been approved', async () => {
      expect(await reverted(newSub.transferFrom(owner, seller, 20000, { from: buyer }))).to.be.true()
    })

    it('can not do the transfer if not enough has been approved', async () => {
      await newSub.approve(buyer, 10000, { from: owner })
      expect(await reverted(newSub.transferFrom(owner, seller, 200000, { from: buyer }))).to.be.true()
    })

    it('can not transfer approved funds if balance is too low', async () => {
      let balance = await newSub.balanceOf(owner)
      await newSub.approve(buyer, 0, { from: owner })
      await newSub.approve(buyer, balance, { from: owner })

      await newSub.transfer(otherAccount, balance / 2, { from: owner })
      expect(await reverted(newSub.transferFrom(owner, seller, balance, { from: buyer }))).to.be.true()
    })

    it('reverts 2nd non-zero approve calls to prevent double-spend race condition', async () => {
      let approvedAmount = 10000
      let spender = buyer

      await newSub.approve(spender, 0, { from: owner })
      await newSub.approve(spender, approvedAmount, { from: owner })
      expect(await newSub.allowance(owner, spender)).to.be.bignumber.equal(approvedAmount)

      expect(await reverted(newSub.approve(spender, approvedAmount, { from: owner }))).to.be.true()
      expect(await newSub.allowance(owner, spender)).to.be.bignumber.equal(approvedAmount)
    })
  })

  describe('token swap', () => {

    describe('migrateAll for a full approval', () => {
      before(async () => {
        await oldSub.transfer(user, 1e2) // one old sub
        await oldSub.approve(newSub.address, 1e2, { from: user })
        await newSub.migrateAll({ from: user })
      })

      it("empties the user's old token balance", async () => {
        expect(await oldSub.balanceOf(user)).to.be.bignumber.equal(0)
      })

      it('awards the user new tokens', async () => {
        expect(await newSub.balanceOf(user)).to.be.bignumber.equal(1e18) // one new sub
      })

      it('"burns" the old tokens', async () => {
        expect(await oldSub.balanceOf(newSub.address)).to.be.bignumber.equal(1e2)
      })
    })

    describe('migrateAll for a partial approval', () => {
      before(async () => {
        await oldSub.transfer(user, 1e2)
        await oldSub.approve(newSub.address, 0.9e2, { from: user })
        await newSub.migrateAll({ from: user })
      })

      it('empties part of the user\'s old token balance', async () => {
        expect(await oldSub.balanceOf(user)).to.be.bignumber.equal(0.1e2)
      })

      it('awards the user new tokens', async () => {
        expect(await newSub.balanceOf(user)).to.be.bignumber.equal(1.9e18)
      })

      it('"burns" the old tokens', async () => {
        expect(await oldSub.balanceOf(newSub.address)).to.be.bignumber.equal(1.9e2)
      })
    })

    describe('migrate a part of the user balance', () => {
      before(async () => {
        await oldSub.approve(newSub.address, 0.1e2, { from: user })
        await newSub.migrate(0.1e2, { from: user })
      })

      it("empties the user's old token balance", async () => {
        expect(await oldSub.balanceOf(user)).to.be.bignumber.equal(0)
      })

      it('awards the user new tokens', async () => {
        expect(await newSub.balanceOf(user)).to.be.bignumber.equal(2e18)
      })

      it('"burns" the old tokens', async () => {
        expect(await oldSub.balanceOf(newSub.address)).to.be.bignumber.equal(2e2)
      })
    })

    describe('trying to migrate more than what was approved', () => {
      before(async () => {
        await oldSub.transfer(user, 1e2)
        await oldSub.approve(newSub.address, 0.1e2, { from: user })
      })

      it('should revert the transaction', async () => {
        expect(await reverted(newSub.migrate(0.2e2, { from: user }))).to.be.true()
      })
    })

    describe('trying to migrate more than the balance', () => {
      before(async () => {
        await oldSub.approve(newSub.address, 2e2, { from: user })
      })

      it('should revert the transaction', async () => {
        expect(await reverted(newSub.migrate(2e2, { from: user }))).to.be.true()
      })
    })

    describe('the end of the migration', () => {
      describe('owner balance and approved amounts out of sync', () => {
        let newSubToAward, oldSubToMigrate

        before(async () => {
          oldSub = await OldSubstratum.new(59200000000, 'Substratum', 2, 'SUB', { from: owner })
          newSub = await NewSubstratum.new(oldSub.address, { from: owner })

          await newSub.transfer(otherAccount, new BigNumber('1e18')) // balance and approved now out of sync
          newSubToAward = await newSub.balanceOf(owner)
          oldSubToMigrate = newSubToAward.times(new BigNumber('1e-16'))

          await oldSub.transfer(user, oldSubToMigrate)
          await oldSub.approve(newSub.address, oldSubToMigrate, { from: user })
          await newSub.migrateAll({ from: user })
        })

        describe('the new balances', async () => {
          it("empties the user's old token balance", async () => {
            expect(await oldSub.balanceOf(user)).to.be.bignumber.equal(0)
          })

          it('awards the user new tokens', async () => {
            expect(await newSub.balanceOf(user)).to.be.bignumber.equal(newSubToAward)
          })

          it('"burns" the old tokens', async () => {
            expect(await oldSub.balanceOf(newSub.address)).to.be.bignumber.equal(oldSubToMigrate)
          })

          it('ends up with no tokens in owner wallet', async () => {
            expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(0)
          })
        })

        describe('trying to migrate more than the owner balance', () => {
          before(async () => {
            // we can do this because old sub had more tokens available to owner
            await oldSub.transfer(user, 1e2)
            await oldSub.approve(newSub.address, 1e2, { from: user })
          })

          it('rejects the transaction', async () => {
            expect(await reverted(newSub.migrateAll({ from: user })))
          })
        })
      })

      describe('owner balance and approved amounts are in sync', () => {
        before(async () => {
          oldSub = await OldSubstratum.new(59200000000, 'Substratum', 2, 'SUB', { from: owner })
          newSub = await NewSubstratum.new(oldSub.address, { from: owner })

          let newSubOwnerBalance = (await newSub.balanceOf(owner))
          let oldSubOwnerBalance = newSubOwnerBalance.times(new BigNumber('1e-16'))
          await oldSub.transfer(user, oldSubOwnerBalance)
          await oldSub.approve(newSub.address, oldSubOwnerBalance, { from: user })
          await newSub.migrateAll({ from: user })
        })

        describe('the new balances', async () => {
          it("empties the user's old token balance", async () => {
            expect(await oldSub.balanceOf(user)).to.be.bignumber.equal(0)
          })

          it('awards the user new tokens', async () => {
            expect(await newSub.balanceOf(user)).to.be.bignumber.equal(472000000e18)
          })

          it('"burns" the old tokens', async () => {
            expect(await oldSub.balanceOf(newSub.address)).to.be.bignumber.equal(472000000e2)
          })

          it('ends up with no tokens in owner wallet', async () => {
            expect(await newSub.balanceOf(owner)).to.be.bignumber.equal(0)
          })
        })

        describe('trying to migrate more than the owner balance', () => {
          before(async () => {
            // we can do this because old sub had more tokens available to owner
            await oldSub.transfer(user, 1e2)
            await oldSub.approve(newSub.address, 1e2, { from: user })
          })

          it('rejects the transaction', async () => {
            expect(await reverted(newSub.migrateAll({ from: user })))
          })
        })
      })
    })
  })
})
