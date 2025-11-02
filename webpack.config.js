const path = require('path')

module.exports = {
  entry: './frontend/src/index.js',
  output: {
    path: path.join(__dirname, 'frontend/dist'),
    filename: 'bundle.js'
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'frontend/public')
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
