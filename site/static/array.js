// array.js — 数组格式互转 / 去重 / 排序工具。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

const arrayFormatLabels = {
  newline: "每行一个",
  comma: "逗号分隔",
  jsonArray: "JSON 数组",
  quotedComma: "双引号逗号",
};


function collapseWhitespace(str) {
  return str.trim().replace(/[\s\u00A0\u3000]+/g, " ").trim();
}


function detectArrayFormat(input) {
  const trimmed = input.trim();
  if (!trimmed) return "newline";
  // JSON array: starts with [ and ends with ]
  if (/^\[.*\]$/s.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "jsonArray";
    } catch (_) { /* fall through */ }
  }
  // Quoted comma: each item wrapped in double quotes
  if (/^"[^"]*"(,"[^"]*")*$/.test(trimmed)) {
    return "quotedComma";
  }
  // Comma: contains commas and no newlines (or fewer)
  const newlineCount = (trimmed.match(/\n/g) || []).length;
  const commaCount = (trimmed.match(/,/g) || []).length;
  if (commaCount > newlineCount && commaCount > 0) {
    return "comma";
  }
  // Default: newline
  return "newline";
}


function parseArrayInput(input, format) {
  const trimmed = input.trim();
  if (!trimmed) return [];

  let items = [];
  switch (format) {
    case "jsonArray": {
      const parsed = JSON.parse(trimmed);
      items = Array.isArray(parsed) ? parsed.map((v) => (v == null ? "" : String(v))) : [];
      break;
    }
    case "quotedComma": {
      const matches = trimmed.match(/"((?:[^"\\]|\\.)*)"/g) || [];
      items = matches.map((s) => s.replace(/^"|"$/g, ""));
      break;
    }
    case "comma":
      items = trimmed.split(",").map((s) => collapseWhitespace(s)).filter((s) => s !== "");
      break;
    case "newline":
    default:
      items = trimmed.split("\n").map((s) => collapseWhitespace(s)).filter((s) => s !== "");
      break;
  }
  return items;
}


function formatArrayOutput(items, format) {
  switch (format) {
    case "jsonArray":
      return JSON.stringify(items, null, 2);
    case "quotedComma":
      return items.map((s) => `"${s}"`).join(",");
    case "comma":
      return items.join(",");
    case "newline":
    default:
      return items.join("\n");
  }
}


function getArrayAffix() {
  return {
    prefix: $("arrayPrefix").value,
    suffix: $("arraySuffix").value,
  };
}


function buildArrayOutput(items, format, prefix = "", suffix = "") {
  const decorated = items.map((item) => `${prefix}${item}${suffix}`);
  return formatArrayOutput(decorated, format);
}


function getArrayItems() {
  const input = $("arrayInput").value;
  let format = $("arrayInputFormat").value;
  if (format === "auto") {
    format = detectArrayFormat(input);
  }
  return parseArrayInput(input, format);
}


function runArrayConversion() {
  const items = getArrayItems();
  if (!items.length) {
    throw new Error("未解析到任何条目");
  }
  const outputFormat = $("arrayOutputFormat").value;
  const { prefix, suffix } = getArrayAffix();
  const output = buildArrayOutput(items, outputFormat, prefix, suffix);
  setOutput("arrayOutput", output);
  const uniqueItems = [...new Set(items)];
  setText("arrayItemCount", items.length);
  setText("arrayUniqueCount", uniqueItems.length);
  setText("arrayOutputFormatLabel", arrayFormatLabels[outputFormat] || outputFormat);
  showToast(`已转换 ${items.length} 条记录`);
}


function bindArrayActions() {
  const syncMeta = () => {
    try {
      const items = getArrayItems();
      const uniqueItems = [...new Set(items)];
      setText("arrayItemCount", items.length);
      setText("arrayUniqueCount", uniqueItems.length);
    } catch (_) {
      setText("arrayItemCount", 0);
      setText("arrayUniqueCount", 0);
    }
  };

  $("arrayInput").addEventListener("input", syncMeta);
  $("arrayInputFormat").addEventListener("change", syncMeta);
  $("arrayOutputFormat").addEventListener("change", () => {
    setText("arrayOutputFormatLabel", arrayFormatLabels[$("arrayOutputFormat").value] || "");
  });
  $("arrayPrefix").addEventListener("input", () => {
    if ($("arrayInput").value.trim()) {
      runArrayConversion();
    }
  });
  $("arraySuffix").addEventListener("input", () => {
    if ($("arrayInput").value.trim()) {
      runArrayConversion();
    }
  });

  const actions = {
    convertArray: () => runArrayConversion(),
    dedupArray: () => {
      const items = getArrayItems();
      if (!items.length) throw new Error("无数据可去重");
      const deduped = [...new Set(items)];
      const removed = items.length - deduped.length;
      const format = $("arrayInputFormat").value === "auto" ? detectArrayFormat($("arrayInput").value) : $("arrayInputFormat").value;
      $("arrayInput").value = formatArrayOutput(deduped, format === "jsonArray" || format === "quotedComma" ? format : "newline");
      // 同步更新输出面板
      const outputFormat = $("arrayOutputFormat").value;
      const { prefix, suffix } = getArrayAffix();
      setOutput("arrayOutput", buildArrayOutput(deduped, outputFormat, prefix, suffix));
      setText("arrayOutputFormatLabel", arrayFormatLabels[outputFormat] || outputFormat);
      showToast(removed > 0
        ? `去重完成：${items.length} 条 → ${deduped.length} 条，移除了 ${removed} 条重复`
        : `无重复项，共 ${items.length} 条`);
    },
    sortArrayAsc: () => {
      const items = getArrayItems();
      if (!items.length) throw new Error("无数据可排序");
      items.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      const format = $("arrayInputFormat").value === "auto" ? detectArrayFormat($("arrayInput").value) : $("arrayInputFormat").value;
      $("arrayInput").value = formatArrayOutput(items, format === "jsonArray" || format === "quotedComma" ? format : "newline");
      const { prefix: prefixAsc, suffix: suffixAsc } = getArrayAffix();
      setOutput("arrayOutput", buildArrayOutput(items, $("arrayOutputFormat").value, prefixAsc, suffixAsc));
      setText("arrayItemCount", items.length);
      showToast("已按升序排列");
    },
    sortArrayDesc: () => {
      const items = getArrayItems();
      if (!items.length) throw new Error("无数据可排序");
      items.sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
      const format = $("arrayInputFormat").value === "auto" ? detectArrayFormat($("arrayInput").value) : $("arrayInputFormat").value;
      $("arrayInput").value = formatArrayOutput(items, format === "jsonArray" || format === "quotedComma" ? format : "newline");
      const { prefix: prefixDesc, suffix: suffixDesc } = getArrayAffix();
      setOutput("arrayOutput", buildArrayOutput(items, $("arrayOutputFormat").value, prefixDesc, suffixDesc));
      setText("arrayItemCount", items.length);
      showToast("已按降序排列");
    },
  };
  bindActions(actions);
}

