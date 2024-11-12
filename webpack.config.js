const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './index.js', // Your entry point
  output: {
    filename: 'openapisnippet.min.js', // Output file name
    path: path.resolve(__dirname, 'dist'), // Output directory
  },
  mode: 'production', // Enable optimizations
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()], // Use Terser for minification
  },
  externals: {
    'mime-db': 'commonjs mime-db', // Exclude mime-db from the bundle
  },
  resolve: {
    fallback: {
      "stream": require.resolve("stream-browserify"),
      "path": require.resolve("path-browserify"),
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "fs": false, // If 'fs' is not required in the browser, set to false to exclude it
      "process": require.resolve("process/browser") // Add process polyfill
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser', // Provide process globally
    }),
    new webpack.DefinePlugin({
      require: 'undefined' // Define `require` as undefined
    })
  ],
};
