var nodeExternals = require('webpack-node-externals');
var webpack = require('webpack');
var path = require('path');
var fs = require('fs');
var PACKAGE_FILE = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
var LIB_NAME = PACKAGE_FILE.name;

/* helper function to get into build directory */
function libPath(name) {
  if ( undefined === name ) {
    return 'dist';
  }

  return path.join('dist', name);
}

module.exports = {
  entry: './src/index.ts',
  target: 'node',
  output: {
    filename: libPath('index.js'),
    library: LIB_NAME,
    libraryTarget: 'umd'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    modules: [
      'node_modules',
      'src',
    ]
  },
  module: {
    loaders: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        exclude: [
          /node_modules/
        ],
      },
    ],
  },
  externals: [nodeExternals(), "fibers"],
  plugins: [
    new webpack.optimize.UglifyJsPlugin(),
  ],
};
