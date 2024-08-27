module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        modules: "auto",
      },
    ],
  ],
  plugins: ["@babel/plugin-transform-modules-commonjs"],
};
