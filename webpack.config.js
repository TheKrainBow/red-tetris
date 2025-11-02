const path = require('path')

module.exports = {
  entry: './docker/frontend/src/index.js',
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'bundle.js'
  },
  devServer: {
    static: {
      directory: __dirname
    },
    host: '0.0.0.0',
    port: 8080,
    hot: true,
    historyApiFallback: true,
    devMiddleware: {
      publicPath: '/'
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
}
