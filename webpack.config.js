const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

module.exports = {
  entry: './packages/web-client/public/js/controller.js',
  output: {
    path: path.resolve(__dirname, 'packages/web-client/dist'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  mode: process.env.NODE_ENV || 'development',
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-cheap-module-source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/,
        type: 'asset/resource'
      },
      {
        test: /\.(html)$/,
        loader: 'html-loader'
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './packages/web-client/public/index.html',
      filename: 'index.html'
    })
  ],
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@emdr/server-core': path.resolve(__dirname, 'packages/server-core'),
      '@emdr/web-client': path.resolve(__dirname, 'packages/web-client')
    }
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'packages/web-client/public')
    },
    compress: true,
    port: 3000,
    hot: true,
    historyApiFallback: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
}
