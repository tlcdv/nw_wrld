export const buildMethodOptions = (
  methodOptions,
  { onInvalidRandomRange, onSwapRandomRange } = {}
) => {
  const out = {};
  const list = Array.isArray(methodOptions) ? methodOptions : [];

  for (const entry of list) {
    const name = entry?.name;
    if (!name) continue;

    const rr = entry?.randomRange;
    if (rr && Array.isArray(rr) && rr.length === 2) {
      let [min, max] = rr;

      if (typeof min !== "number" || typeof max !== "number") {
        if (typeof onInvalidRandomRange === "function") {
          try {
            onInvalidRandomRange({ name, min, max, value: entry?.value });
          } catch {}
        }
        out[name] = entry?.value;
        continue;
      }

      if (min > max) {
        if (typeof onSwapRandomRange === "function") {
          try {
            onSwapRandomRange({ name, min, max });
          } catch {}
        }
        [min, max] = [max, min];
      }

      out[name] =
        Number.isInteger(min) && Number.isInteger(max)
          ? Math.floor(Math.random() * (max - min + 1)) + min
          : Math.random() * (max - min) + min;
      continue;
    }

    out[name] = entry?.value;
  }

  return out;
};

export const parseMatrixOptions = (methodOptions) => {
  const options = buildMethodOptions(methodOptions);
  const border = Boolean(options.border);
  const m = options.matrix;

  let rows = 1;
  let cols = 1;
  let excludedCells = [];

  if (Array.isArray(m)) {
    rows = m[0] || 1;
    cols = m[1] || 1;
  } else if (m && typeof m === "object") {
    rows = m.rows || 1;
    cols = m.cols || 1;
    excludedCells = Array.isArray(m.excludedCells) ? m.excludedCells : [];
  }

  return {
    rows: Math.max(1, Number(rows) || 1),
    cols: Math.max(1, Number(cols) || 1),
    excludedCells,
    border,
  };
};
