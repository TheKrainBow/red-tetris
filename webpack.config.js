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
    // Allow development server to accept requests from specified hosts
    allowedHosts: ['localhost', 'maagosti.fr', 'cci.maagosti.fr'],
    hot: true,
    historyApiFallback: true,
    devMiddleware: {
      publicPath: '/'
    }
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
}
