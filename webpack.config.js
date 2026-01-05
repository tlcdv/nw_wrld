const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");

const monacoRoot = path.dirname(require.resolve("monaco-editor/package.json"));

module.exports = {
  mode: "development",
  entry: {
    bundle: ["./src/rendererPolyfills.js", "./src/renderer.js"],
    moduleSandbox: "./src/projector/moduleSandboxEntry.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    globalObject: "globalThis",
    publicPath: "auto", // Use this as the publicPath
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
      {
        test: /\.scss$/,
        use: [
          "style-loader",
          "css-loader",
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                ident: "postcss",
                plugins: [require("tailwindcss"), require("autoprefixer")],
              },
            },
          },
          {
            loader: "sass-loader",
            options: {
              api: "modern",
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new MonacoWebpackPlugin({
      languages: ["javascript"],
      filename: "vs/[name].worker.js",
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(monacoRoot, "min", "vs"),
          to: path.resolve(__dirname, "dist", "vs"),
        },
      ],
    }),
  ],
  devServer: {
    static: path.join(__dirname, "dist"),
    compress: true,
    port: 9000,
    hot: true,
    liveReload: false,
    devMiddleware: {
      writeToDisk: true,
    },
    watchFiles: {
      paths: ["src/**/*"],
      options: {
        ignored: /src\/shared\/json\/userData\.json$/,
      },
    },
  },
  watchOptions: {
    ignored: /src\/shared\/json\/userData\.json$/,
  },
  target: "web",
};
