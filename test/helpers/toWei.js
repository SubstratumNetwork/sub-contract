/* global web3 */
const BigNumber = web3.BigNumber

module.exports = n => {
  let precisionFactor = new BigNumber(10).pow(18)
  return new BigNumber(n).times(precisionFactor)
}
