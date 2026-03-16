const path = require('path')

module.exports = {
  mode: 'development',
  entry: {
    viewer: './src/viewer.js',
    controller: './src/controller.js'
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'public', 'dist')
  },
  resolve: {
    modules: [
      path.resolve(__dirname, 'src'),
      path.resolve(__dirname, '..', '..', 'node_modules'),
      'node_modules'
    ],
    alias: {
      '@emdr/shared': path.resolve(__dirname, '..', 'shared')
    }
  },
  devtool: 'source-map'
}
