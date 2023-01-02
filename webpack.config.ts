const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: {
    createEvent: './src/admin/createEvent.ts',
    deleteEvent: './src/admin/deleteEvent.ts',
    server: './src/index.ts',
  },
  target: 'node',
  externals: [nodeExternals()], // avoid warning inside express
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  mode: 'development',
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  plugins: [],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].js'
  }
};
