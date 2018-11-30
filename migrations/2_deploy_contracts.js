/* global artifacts */

let OldSubstratum = artifacts.require('MyAdvancedToken')
let NewSubstratum = artifacts.require('Substratum')

module.exports = function (deployer, network, accounts) {
  deployer.deploy(OldSubstratum, 59200000000, 'Substratum', 2, 'SUB').then(() => {
    return deployer.deploy(NewSubstratum, OldSubstratum.address)
  })
}
