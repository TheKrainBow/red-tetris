const serverHost = process.env.SERVER_HOST || '0.0.0.0'
const serverPort = Number(process.env.SERVER_PORT || 3004)

const params = {
  server: {
    host: serverHost,
    port: serverPort,
    get url () {
      return 'http://' + this.host + ':' + this.port
    }
  }
}

module.exports = params
