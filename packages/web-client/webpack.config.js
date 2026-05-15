const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry: {
    viewer: './src/viewer.js',
    controller: './src/controller.js',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'public', 'dist'),
  },
  resolve: {
    modules: [
      path.resolve(__dirname, 'src'),
      path.resolve(__dirname, '..', '..', 'node_modules'),
      'node_modules',
    ],
    alias: {
      '@emdr/shared': path.resolve(__dirname, '..', 'shared'),
    },
  },
  devtool: isProd ? false : 'source-map',
};
