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
  // Extract shared code (physics engine, i18n, network) into a common chunk
  optimization: {
    splitChunks: {
      chunks: 'all',
      minSize: 0,
      cacheGroups: {
        default: false,
        defaultVendors: false,
        shared: {
          name: 'shared',
          chunks: 'all',
          minChunks: 2,
          minSize: 0,
        },
      },
    },
  },
  devtool: isProd ? false : 'source-map',
};
