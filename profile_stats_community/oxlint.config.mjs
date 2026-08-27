export default {
  categories: {
    correctness: "off",
  },
  plugins: ["eslint"],
  rules: {
    "eslint/complexity": ["error", { max: 20, variant: "modified" }],
  },
};
