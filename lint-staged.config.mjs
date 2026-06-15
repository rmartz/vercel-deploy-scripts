export default {
  "*.{js,mjs,cjs,ts}": ["eslint --fix --max-warnings 0 --no-warn-ignored"],
  "*.{js,mjs,cjs,ts,json,md,yml,yaml}": (files) => {
    const toFormat = files.filter((f) => !f.endsWith("pnpm-lock.yaml"));
    return toFormat.length > 0
      ? [`prettier --write ${toFormat.join(" ")}`]
      : [];
  },
};
