module.exports = function yamlStringLoader(source) {
  if (this && typeof this.cacheable === 'function') {
    this.cacheable()
  }
  const json = JSON.stringify(source.toString())
  return `export default ${json};`
}
