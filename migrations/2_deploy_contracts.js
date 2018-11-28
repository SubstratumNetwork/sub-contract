/* global artifacts */

let Substratum = artifacts.require('./Substratum.sol')

module.exports = function (deployer, network, accounts) {
  deployer.deploy(Substratum)
}
