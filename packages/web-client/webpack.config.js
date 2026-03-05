const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './public/js/controller.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/',
  },
  mode: process.env.NODE_ENV || 'development',
  devtool:
    process.env.NODE_ENV === 'production' ? 'source-map' : 'eval-source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public/css', to: 'css', noErrorOnMissing: true },
        { from: 'public/sounds', to: 'sounds', noErrorOnMissing: true },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@emdr/server-core': path.resolve(__dirname, '../server-core'),
      '@emdr/web-client': path.resolve(__dirname, '.'),
    },
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 3001,
    hot: true,
    historyApiFallback: true,
  },
};
