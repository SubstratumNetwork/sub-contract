module.exports = async promise => {
  try {
    await promise
    return false
  } catch (error) {
    return error.message.search('revert') >= 0
  }
}
