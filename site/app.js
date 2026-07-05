const state = {
  parsedImageUrls: [],
  parsedImageItems: [],
  encodingType: "url",
  imageCompareSettings: {
    columns: 4,
    zoom: 60,
    failedOnly: false,
  },
  fapiaoImageFiles: [],
  fapiaoProgressTimer: null,
  toastTimer: null,
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function $(id) {
  return document.getElementById(id);
}

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.background = isError ? "rgba(185, 28, 28, 0.92)" : "rgba(31, 41, 55, 0.92)";
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function setOutput(id, value) {
  $(id).value = value;
}

function setText(id, value) {
  $(id).textContent = String(value);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    const originalText = button.textContent;
    button.addEventListener("click", async () => {
      const targetId = button.dataset.copyTarget;
      const element = $(targetId);
      const value = "value" in element ? element.value || element.textContent || "" : element.textContent || "";
      if (!value.trim()) {
        showToast("没有可复制的内容", true);
        return;
      }
      try {
        await copyText(value);
        showToast("已复制");
        button.classList.add("copied");
        button.textContent = "已复制";
        setTimeout(() => {
          button.classList.remove("copied");
          button.textContent = originalText;
        }, 1500);
      } catch (error) {
        showToast(`复制失败: ${error.message}`, true);
      }
    });
  });
}

function activatePanel(panelId) {
  const targetPanel = $(panelId);
  if (!targetPanel) {
    return;
  }
  document.querySelectorAll(".panel-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panelId);
  });
  document.querySelectorAll(".tool-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
  setText("workspaceTitle", targetPanel.dataset.panelTitle || "");
  setText("workspaceSubtitle", targetPanel.dataset.panelDescription || "");
}

function bindNavigation() {
  document.querySelectorAll(".panel-chip").forEach((button) => {
    button.addEventListener("click", () => {
      activatePanel(button.dataset.panel);
    });
  });
  const initialPanel =
    document.querySelector(".tool-panel.active")?.id ??
    document.querySelector(".tool-panel")?.id;
  if (initialPanel) {
    activatePanel(initialPanel);
  }
}

function activateSubtab(button) {
  const tabs = button.closest(".section-tabs");
  const panel = button.closest(".tool-panel");
  if (!tabs || !panel) {
    return;
  }
  const targetId = button.dataset.subtabTarget;
  tabs.querySelectorAll(".section-tab").forEach((tab) => {
    tab.classList.toggle("active", tab === button);
  });
  panel.querySelectorAll(".subpanel").forEach((subpanel) => {
    subpanel.classList.toggle("active", subpanel.id === targetId);
  });
}

function bindSubtabs() {
  document.querySelectorAll(".section-tabs").forEach((tabs) => {
    tabs.querySelectorAll(".section-tab").forEach((button) => {
      button.addEventListener("click", () => activateSubtab(button));
    });
    const initialButton = tabs.querySelector(".section-tab.active") || tabs.querySelector(".section-tab");
    if (initialButton) {
      activateSubtab(initialButton);
    }
  });
}

function toUnicodeEscape(input) {
  return Array.from(input)
    .map((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint <= 0xffff) {
        return `\\u${codePoint.toString(16).padStart(4, "0")}`;
      }
      const surrogate = codePoint - 0x10000;
      const high = 0xd800 + (surrogate >> 10);
      const low = 0xdc00 + (surrogate & 0x3ff);
      return `\\u${high.toString(16)}\\u${low.toString(16)}`;
    })
    .join("");
}

function fromUnicodeEscape(input) {
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function encodeBase64Utf8(input) {
  const bytes = textEncoder.encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Utf8(input) {
  const binary = atob(input.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return textDecoder.decode(bytes);
}

const encodingModes = {
  url: {
    badge: "URL",
    name: "URL 编码 / 解码",
    hint: "适合处理 query 参数、回调地址和浏览器地址栏内容。",
    placeholder: "输入 URL 参数、路径或普通文本",
    encodeLabel: "编码",
    decodeLabel: "解码",
    encodeResultLabel: "原文 → 编码",
    decodeResultLabel: "编码 → 原文",
    encode: (value) => encodeURIComponent(value),
    decode: (value) => decodeURIComponent(value),
  },
  unicode: {
    badge: "Unicode",
    name: "Unicode 编码 / 解码",
    hint: "适合处理带 \\uXXXX 的转义文本和中文字符互转。",
    placeholder: "输入中文，或 \\u4f60\\u597d 这样的文本",
    encodeLabel: "编码",
    decodeLabel: "解码",
    encodeResultLabel: "原文 → 编码",
    decodeResultLabel: "编码 → 原文",
    encode: (value) => toUnicodeEscape(value),
    decode: (value) => fromUnicodeEscape(value),
  },
  base64: {
    badge: "Base64",
    name: "Base64 编码 / 解码",
    hint: "适合处理接口传输文本、调试 token 片段和简单文本封装。",
    placeholder: "输入任意 UTF-8 文本或 Base64 内容",
    encodeLabel: "编码",
    decodeLabel: "解码",
    encodeResultLabel: "原文 → 编码",
    decodeResultLabel: "编码 → 原文",
    encode: (value) => encodeBase64Utf8(value),
    decode: (value) => decodeBase64Utf8(value),
  },
  escape: {
    badge: "Escape",
    name: "字符串转义 / 去除转义",
    hint: "适合把普通文本转成可嵌入 JSON 或代码字符串的转义文本，也可反向还原。",
    placeholder: "输入普通文本，或带 \\n、\\t、\\\" 的转义字符串",
    encodeLabel: "转义",
    decodeLabel: "去除转义",
    encodeResultLabel: "原文 → 转义文本",
    decodeResultLabel: "转义文本 → 原文",
    encode: (value) => jsonEscapeString(value),
    decode: (value) => jsonUnescapeString(value),
  },
};

function updateEncodingUi() {
  const mode = encodingModes[state.encodingType];
  document.querySelectorAll("[data-encoding-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.encodingType === state.encodingType);
  });
  setText("encodingActiveBadge", mode.badge);
  setText("encodingModeName", mode.name);
  setText("encodingModeHint", mode.hint);
  $("encodingInput").placeholder = mode.placeholder;
  setText("encodingEncodeBtn", mode.encodeLabel);
  setText("encodingDecodeBtn", mode.decodeLabel);
}

function updateEncodingOutputMeta(result, directionLabel) {
  setText("encodingLastAction", directionLabel);
  setText("encodingOutputLength", result.length);
}

function runEncodingTransform(direction) {
  const mode = encodingModes[state.encodingType];
  const input = $("encodingInput").value;
  const result = direction === "encode" ? mode.encode(input) : mode.decode(input);
  setOutput("encodingOutput", result);
  updateEncodingOutputMeta(result, direction === "encode" ? mode.encodeResultLabel : mode.decodeResultLabel);
}

function bindEncodingActions() {
  updateEncodingUi();
  updateEncodingOutputMeta("", "等待操作");
  document.querySelectorAll("[data-encoding-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.encodingType = button.dataset.encodingType;
      updateEncodingUi();
    });
  });

  const actions = {
    runEncodingEncode: () => runEncodingTransform("encode"),
    runEncodingDecode: () => runEncodingTransform("decode"),
    fillEncodingResult: () => {
      $("encodingInput").value = $("encodingOutput").value;
    },
    clearEncodingPanels: () => {
      $("encodingInput").value = "";
      $("encodingOutput").value = "";
      updateEncodingOutputMeta("", "等待操作");
    },
  };
  bindActions(actions);
}

function safeJsonParse(input) {
  return JSON.parse(input);
}

function jsonEscapeString(input) {
  return JSON.stringify(input).slice(1, -1);
}

function jsonUnescapeString(input) {
  return JSON.parse(`"${input.replace(/"/g, '\\"')}"`);
}

function normalizeRowValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function jsonToCsv(data) {
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.length || typeof rows[0] !== "object" || rows[0] === null || Array.isArray(rows[0])) {
    throw new Error("JSON 转 CSV 需要对象数组或对象");
  }
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const escapeCell = (value) => {
    const stringValue = normalizeRowValue(value);
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const lines = [columns.join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((column) => escapeCell(row[column])).join(","));
  });
  return lines.join("\n");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function csvToJson(csv) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV 至少需要表头和一行数据");
  }
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return JSON.stringify(rows, null, 2);
}

function createTreeLeaf(key, value) {
  const leaf = document.createElement("div");
  leaf.className = "tree-leaf";

  const keySpan = document.createElement("span");
  keySpan.className = "tree-key";
  keySpan.textContent = key;
  leaf.appendChild(keySpan);
  leaf.appendChild(document.createTextNode(": "));

  const valueSpan = document.createElement("span");
  valueSpan.className = `tree-value ${value === null ? "null" : typeof value}`;
  valueSpan.textContent = value === null ? "null" : JSON.stringify(value);
  leaf.appendChild(valueSpan);
  return leaf;
}

function createTreeNode(key, value, depth = 0, isRoot = false) {
  if (value === null || typeof value !== "object") {
    return createTreeLeaf(key, value);
  }

  const details = document.createElement("details");
  details.className = "tree-branch";
  details.open = depth < 1 || isRoot;
  if (isRoot) {
    details.dataset.root = "true";
  }

  const summary = document.createElement("summary");
  summary.className = "tree-summary";

  const keySpan = document.createElement("span");
  keySpan.className = "tree-key";
  keySpan.textContent = key;
  summary.appendChild(keySpan);

  const typeSpan = document.createElement("span");
  typeSpan.className = "tree-type";
  typeSpan.textContent = Array.isArray(value) ? "Array" : "Object";
  summary.appendChild(typeSpan);

  const countSpan = document.createElement("span");
  countSpan.className = "tree-count";
  countSpan.textContent = `${Array.isArray(value) ? value.length : Object.keys(value).length} 项`;
  summary.appendChild(countSpan);

  const children = document.createElement("div");
  children.className = "tree-children";
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [index, entry])
    : Object.entries(value);
  entries.forEach(([childKey, childValue]) => {
    children.appendChild(createTreeNode(String(childKey), childValue, depth + 1));
  });

  details.appendChild(summary);
  details.appendChild(children);
  return details;
}

function renderJsonTree(jsonValue) {
  const tree = $("jsonTree");
  tree.innerHTML = "";
  tree.classList.remove("empty-state");
  tree.appendChild(createTreeNode("root", jsonValue, 0, true));
}

function setJsonTreeExpansion(expanded) {
  const branches = $("jsonTree").querySelectorAll(".tree-branch");
  if (!branches.length) {
    throw new Error("请先生成 JSON 树视图");
  }
  branches.forEach((branch) => {
    branch.open = expanded || branch.dataset.root === "true";
  });
}

function formatJsonPath(basePath, key, isArrayIndex = false) {
  if (isArrayIndex) {
    return `${basePath}[${key}]`;
  }
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${basePath}.${key}` : `${basePath}[${JSON.stringify(key)}]`;
}

function formatJsonDiffValue(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value);
}

function diffJsonValues(left, right, path = "$", diffs = []) {
  if (Object.is(left, right)) {
    return diffs;
  }

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  const leftIsObject = left !== null && typeof left === "object";
  const rightIsObject = right !== null && typeof right === "object";

  if (leftIsArray && rightIsArray) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = formatJsonPath(path, index, true);
      if (index >= left.length) {
        diffs.push({ type: "added", path: nextPath, after: right[index] });
        continue;
      }
      if (index >= right.length) {
        diffs.push({ type: "removed", path: nextPath, before: left[index] });
        continue;
      }
      diffJsonValues(left[index], right[index], nextPath, diffs);
    }
    return diffs;
  }

  if (leftIsObject && rightIsObject && !leftIsArray && !rightIsArray) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    keys.forEach((key) => {
      const nextPath = formatJsonPath(path, key);
      if (!(key in left)) {
        diffs.push({ type: "added", path: nextPath, after: right[key] });
        return;
      }
      if (!(key in right)) {
        diffs.push({ type: "removed", path: nextPath, before: left[key] });
        return;
      }
      diffJsonValues(left[key], right[key], nextPath, diffs);
    });
    return diffs;
  }

  diffs.push({
    type: "changed",
    path,
    before: left,
    after: right,
  });
  return diffs;
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function getValueMeta(value, exists) {
  if (!exists) {
    return "";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (isObjectLike(value)) {
    return `Object(${Object.keys(value).length})`;
  }
  return typeof value;
}

function getPreviewText(value, exists, isBranch = false) {
  if (!exists) {
    return "此侧不存在该节点";
  }
  if (isBranch) {
    return Array.isArray(value) ? `包含 ${value.length} 个节点` : `包含 ${Object.keys(value ?? {}).length} 个字段`;
  }
  const text = formatJsonDiffValue(value);
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function getDiffStatusLabel(status) {
  if (status === "added") {
    return "新增";
  }
  if (status === "removed") {
    return "删除";
  }
  if (status === "changed") {
    return "变更";
  }
  return "一致";
}

function buildDiffTreeData(key, left, right, leftExists = true, rightExists = true) {
  const leftContainer = leftExists && isObjectLike(left);
  const rightContainer = rightExists && isObjectLike(right);
  const comparableContainers = leftContainer && rightContainer && Array.isArray(left) === Array.isArray(right);
  const singleContainer = (leftContainer && !rightExists) || (rightContainer && !leftExists);
  const canBranch = comparableContainers || singleContainer;

  if (canBranch) {
    const sourceKeys = comparableContainers
      ? Array.from(
          new Set([
            ...(Array.isArray(left) ? left.map((_, index) => index) : Object.keys(left)),
            ...(Array.isArray(right) ? right.map((_, index) => index) : Object.keys(right)),
          ])
        )
      : Array.isArray(left || right)
        ? (left || right).map((_, index) => index)
        : Object.keys(left || right || {});

    const children = sourceKeys.map((childKey) => {
      const childLeftExists = leftExists && leftContainer ? childKey in left : false;
      const childRightExists = rightExists && rightContainer ? childKey in right : false;
      return buildDiffTreeData(
        String(childKey),
        childLeftExists ? left[childKey] : undefined,
        childRightExists ? right[childKey] : undefined,
        childLeftExists,
        childRightExists
      );
    });

    const hasChildChange = children.some((child) => child.status !== "unchanged");
    const status = !leftExists ? "added" : !rightExists ? "removed" : hasChildChange ? "changed" : "unchanged";

    return {
      kind: "branch",
      key,
      status,
      left,
      right,
      leftExists,
      rightExists,
      children,
    };
  }

  return {
    kind: "leaf",
    key,
    status: !leftExists ? "added" : !rightExists ? "removed" : Object.is(left, right) ? "unchanged" : "changed",
    left,
    right,
    leftExists,
    rightExists,
    children: [],
  };
}

function getSideCellStatus(node, side) {
  const exists = side === "left" ? node.leftExists : node.rightExists;
  if (!exists) {
    return "empty";
  }
  if (node.status === "added") {
    return side === "right" ? "added" : "empty";
  }
  if (node.status === "removed") {
    return side === "left" ? "removed" : "empty";
  }
  return node.status;
}

function createDiffCell(node, side, showToggle = false) {
  const exists = side === "left" ? node.leftExists : node.rightExists;
  const value = side === "left" ? node.left : node.right;
  const statusClass = getSideCellStatus(node, side);
  const cell = document.createElement("div");
  cell.className = `diff-cell ${statusClass}`;

  if (!exists) {
    cell.innerHTML = `<span class="diff-preview">此侧不存在该节点</span>`;
    return cell;
  }

  const header = document.createElement("div");
  header.className = "diff-cell-header";

  if (showToggle) {
    const toggleIcon = document.createElement("span");
    toggleIcon.className = "diff-toggle-icon";
    toggleIcon.textContent = "▸";
    header.appendChild(toggleIcon);
  }

  const keySpan = document.createElement("span");
  keySpan.className = "diff-key";
  keySpan.textContent = node.key;
  header.appendChild(keySpan);

  const metaSpan = document.createElement("span");
  metaSpan.className = "diff-meta";
  metaSpan.textContent = getValueMeta(value, exists);
  header.appendChild(metaSpan);

  cell.appendChild(header);

  const status = document.createElement("span");
  status.className = `diff-status ${statusClass === "empty" ? "unchanged" : statusClass}`;
  status.textContent = exists ? getDiffStatusLabel(statusClass === "empty" ? "unchanged" : statusClass) : "空";
  cell.appendChild(status);

  const preview = document.createElement("div");
  preview.className = "diff-preview";
  preview.textContent = getPreviewText(value, exists, node.kind === "branch");
  cell.appendChild(preview);

  return cell;
}

function renderDiffTreeNode(node, depth = 0) {
  if (node.kind === "leaf") {
    const row = document.createElement("div");
    row.className = "diff-row";
    row.appendChild(createDiffCell(node, "left"));
    row.appendChild(createDiffCell(node, "right"));
    return row;
  }

  const details = document.createElement("details");
  details.className = "diff-branch";
  details.open = depth < 1 || node.status !== "unchanged";

  const summary = document.createElement("summary");
  summary.className = "diff-branch-summary";

  const row = document.createElement("div");
  row.className = "diff-row";
  row.appendChild(createDiffCell(node, "left", true));
  row.appendChild(createDiffCell(node, "right"));
  summary.appendChild(row);

  const children = document.createElement("div");
  children.className = "diff-branch-children";
  node.children.forEach((child) => {
    children.appendChild(renderDiffTreeNode(child, depth + 1));
  });

  details.appendChild(summary);
  details.appendChild(children);
  return details;
}

function renderJsonDiffViewer(left, right) {
  const viewer = $("jsonDiffViewer");
  viewer.innerHTML = "";
  viewer.classList.remove("empty-state");

  const head = document.createElement("div");
  head.className = "diff-viewer-head";
  head.innerHTML = `
    <div class="diff-head-cell">左侧 JSON</div>
    <div class="diff-head-cell">右侧 JSON</div>
  `;
  viewer.appendChild(head);

  const body = document.createElement("div");
  body.className = "diff-viewer-body";

  const root = buildDiffTreeData("root", left, right, true, true);
  if (root.kind === "branch" && root.children.length) {
    root.children.forEach((child) => {
      body.appendChild(renderDiffTreeNode(child, 0));
    });
  } else {
    body.appendChild(renderDiffTreeNode(root, 0));
  }

  viewer.appendChild(body);
}

function setJsonDiffExpansion(expanded) {
  const branches = $("jsonDiffViewer").querySelectorAll(".diff-branch");
  if (!branches.length) {
    throw new Error("请先生成 JSON 对比结果");
  }
  branches.forEach((branch) => {
    branch.open = expanded;
  });
}

function updateJsonDiffStats(diffs) {
  setText("jsonDiffTotal", diffs.length);
  setText(
    "jsonDiffAdded",
    diffs.filter((item) => item.type === "added").length
  );
  setText(
    "jsonDiffRemoved",
    diffs.filter((item) => item.type === "removed").length
  );
  setText(
    "jsonDiffChanged",
    diffs.filter((item) => item.type === "changed").length
  );
}

function renderJsonDiffOutput(diffs) {
  const output = $("jsonDiffOutput");
  if (!diffs.length) {
    output.textContent = "两份 JSON 完全一致";
    output.classList.add("empty-state");
    updateJsonDiffStats([]);
    return;
  }

  const lines = diffs.map((item) => {
    if (item.type === "added") {
      return `[新增] ${item.path}\n  + ${formatJsonDiffValue(item.after)}`;
    }
    if (item.type === "removed") {
      return `[删除] ${item.path}\n  - ${formatJsonDiffValue(item.before)}`;
    }
    return `[变更] ${item.path}\n  - ${formatJsonDiffValue(item.before)}\n  + ${formatJsonDiffValue(item.after)}`;
  });
  output.textContent = lines.join("\n\n");
  output.classList.remove("empty-state");
  updateJsonDiffStats(diffs);
}

function bindJsonActions() {
  updateJsonDiffStats([]);
  const actions = {
    jsonFormat: () => {
      const parsed = safeJsonParse($("jsonInput").value);
      setOutput("jsonOutput", JSON.stringify(parsed, null, 2));
      renderJsonTree(parsed);
    },
    jsonMinify: () => {
      const parsed = safeJsonParse($("jsonInput").value);
      setOutput("jsonOutput", JSON.stringify(parsed));
      renderJsonTree(parsed);
    },
    jsonToCsv: () => {
      const parsed = safeJsonParse($("jsonInput").value);
      setOutput("jsonOutput", jsonToCsv(parsed));
    },
    csvToJson: () => setOutput("jsonOutput", csvToJson($("jsonInput").value)),
    jsonRenderTree: () => {
      const source = $("jsonOutput").value.trim() || $("jsonInput").value.trim();
      const parsed = safeJsonParse(source);
      renderJsonTree(parsed);
    },
    jsonExpandTree: () => {
      setJsonTreeExpansion(true);
    },
    jsonCollapseTree: () => {
      setJsonTreeExpansion(false);
    },
    jsonCompare: () => {
      const left = safeJsonParse($("jsonDiffLeft").value);
      const right = safeJsonParse($("jsonDiffRight").value);
      const diffs = diffJsonValues(left, right);
      renderJsonDiffViewer(left, right);
      renderJsonDiffOutput(diffs);
      showToast(diffs.length ? `发现 ${diffs.length} 处差异` : "两份 JSON 完全一致");
    },
    jsonDiffExpandAll: () => {
      setJsonDiffExpansion(true);
    },
    jsonDiffCollapseAll: () => {
      setJsonDiffExpansion(false);
    },
    jsonLoadDiffLeft: () => {
      $("jsonDiffLeft").value = $("jsonInput").value;
    },
    jsonLoadDiffRight: () => {
      $("jsonDiffRight").value = $("jsonOutput").value || $("jsonInput").value;
    },
  };
  bindActions(actions);
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

const sqlExamples = {
  SELECT: `SELECT u.id, u.name, u.email
FROM users u
WHERE u.status = 'active'
  AND u.created_at > '2024-01-01'
ORDER BY u.name ASC
LIMIT 100;`,
  INSERT: `INSERT INTO orders (user_id, product_id, quantity, price)
VALUES
  (101, 5001, 2, 29.99),
  (102, 5003, 1, 49.99),
  (103, 5007, 5, 9.99);`,
  COMPLEX: `SELECT
  FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(create_time) / 600) * 600) AS 十分钟区间,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS 成功数,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS 失败数,
  COUNT(*) AS 总数,
  CONCAT(ROUND(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1), '%') AS 失败率
FROM baidu_check_price_log
WHERE create_time >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
GROUP BY FLOOR(UNIX_TIMESTAMP(create_time) / 600)
ORDER BY 十分钟区间
LIMIT 100;`,
};

function compressSql(sql) {
  if (!sql || sql.trim() === "") {
    return "";
  }
  let result = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n\r]*/g, "")
    .replace(/[\r\n\t\f\v]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
  result = result.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+\(/g, "$1(");
  result = result.replace(/\s*,\s*/g, ", ");
  result = result.replace(/\s*\)\s*/g, ") ");
  result = result.replace(/ +/g, " ").trim();
  return result;
}

function updateSqlInputMeta(input) {
  setText("sqlInputCharCount", `${input.length} 字符`);
}

function updateSqlOutputMeta(input, output) {
  const inLen = input.length;
  const outLen = output.length;
  setText("sqlOutputCharCount", `${outLen} 字符`);
  setText("sqlLineCountBefore", input === "" ? 0 : input.split("\n").length);
  setText("sqlLineCountAfter", output === "" ? 0 : output.split("\n").length);
  if (inLen > 0 && outLen > 0) {
    const ratio = (((inLen - outLen) / inLen) * 100).toFixed(1);
    setText("sqlCompressRatio", `${ratio}%`);
    return;
  }
  setText("sqlCompressRatio", "-");
}

function runSqlCompress() {
  const input = $("sqlInput").value;
  const output = compressSql(input);
  setOutput("sqlOutput", output);
  updateSqlInputMeta(input);
  updateSqlOutputMeta(input, output);
  if (output) {
    showToast("SQL 已压缩");
  }
}

function bindSqlActions() {
  updateSqlInputMeta("");
  updateSqlOutputMeta("", "");

  $("sqlInput").addEventListener("input", (event) => {
    updateSqlInputMeta(event.target.value);
  });
  $("sqlInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runSqlCompress();
    }
  });

  const actions = {
    compressSql: () => runSqlCompress(),
    clearSqlPanels: () => {
      $("sqlInput").value = "";
      $("sqlOutput").value = "";
      updateSqlInputMeta("");
      updateSqlOutputMeta("", "");
      $("sqlInput").focus();
    },
    fillSqlExampleSelect: () => {
      $("sqlInput").value = sqlExamples.SELECT;
      runSqlCompress();
    },
    fillSqlExampleInsert: () => {
      $("sqlInput").value = sqlExamples.INSERT;
      runSqlCompress();
    },
    fillSqlExampleComplex: () => {
      $("sqlInput").value = sqlExamples.COMPLEX;
      runSqlCompress();
    },
  };
  bindActions(actions);
}

function updateCurrentTime() {
  const now = new Date();
  $("nowDisplay").textContent = formatDateTime(now);
  $("nowSeconds").textContent = String(Math.floor(now.getTime() / 1000));
  $("nowMilliseconds").textContent = String(now.getTime());
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "本地时区";
}

function resetTimeConversionView() {
  setText("timeDetectedType", "等待输入");
  setText("timePrimaryLabel", "主结果");
  setText("timePrimaryValue", "-");
  setText("timeSecondaryLabel", "补充结果");
  setText("timeSecondaryValue", "-");
  setText("timeResultZone", getLocalTimeZone());
  setOutput("timeConversionOutput", "");
}

function buildTimeConversionResult(raw) {
  const input = raw.trim();
  if (!input) {
    throw new Error("请输入时间或时间戳");
  }

  const timeZone = getLocalTimeZone();
  if (/^\d{10}$/.test(input) || /^\d{13}$/.test(input)) {
    const milliseconds = input.length === 10 ? Number(input) * 1000 : Number(input);
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) {
      throw new Error("时间戳无效");
    }
    return {
      detectedType: input.length === 10 ? "秒级时间戳" : "毫秒级时间戳",
      primaryLabel: "本地时间",
      primaryValue: formatDateTime(date),
      secondaryLabel: "ISO 时间",
      secondaryValue: date.toISOString(),
      output: [
        `识别类型: ${input.length === 10 ? "秒级时间戳" : "毫秒级时间戳"}`,
        `本地时间: ${formatDateTime(date)}`,
        `秒级时间戳: ${Math.floor(milliseconds / 1000)}`,
        `毫秒级时间戳: ${milliseconds}`,
        `ISO 时间: ${date.toISOString()}`,
        `时区: ${timeZone}`,
      ].join("\n"),
    };
  }

  const normalized = input.replace(/\//g, "-").replace("T", " ");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("无法识别该时间格式");
  }
  const milliseconds = date.getTime();
  return {
    detectedType: "日期时间",
    primaryLabel: "秒级时间戳",
    primaryValue: String(Math.floor(milliseconds / 1000)),
    secondaryLabel: "毫秒级时间戳",
    secondaryValue: String(milliseconds),
    output: [
      "识别类型: 日期时间",
      `本地时间: ${formatDateTime(date)}`,
      `秒级时间戳: ${Math.floor(milliseconds / 1000)}`,
      `毫秒级时间戳: ${milliseconds}`,
      `ISO 时间: ${date.toISOString()}`,
      `时区: ${timeZone}`,
    ].join("\n"),
  };
}

function applyTimeConversionResult(result) {
  setText("timeDetectedType", result.detectedType);
  setText("timePrimaryLabel", result.primaryLabel);
  setText("timePrimaryValue", result.primaryValue);
  setText("timeSecondaryLabel", result.secondaryLabel);
  setText("timeSecondaryValue", result.secondaryValue);
  setText("timeResultZone", getLocalTimeZone());
  setOutput("timeConversionOutput", result.output);
}

function previewTimeConversion() {
  const raw = $("timeSmartInput").value.trim();
  if (!raw) {
    resetTimeConversionView();
    return;
  }
  try {
    applyTimeConversionResult(buildTimeConversionResult(raw));
  } catch {
    setText("timeDetectedType", "等待有效输入");
    setText("timePrimaryLabel", "主结果");
    setText("timePrimaryValue", "-");
    setText("timeSecondaryLabel", "补充结果");
    setText("timeSecondaryValue", "-");
    setText("timeResultZone", getLocalTimeZone());
    setOutput("timeConversionOutput", "");
  }
}

function bindTimeActions() {
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);
  resetTimeConversionView();
  $("timeSmartInput").addEventListener("input", previewTimeConversion);

  const actions = {
    smartConvertTime: () => {
      const result = buildTimeConversionResult($("timeSmartInput").value);
      applyTimeConversionResult(result);
      showToast(`已识别为${result.detectedType}`);
    },
    fillNowSeconds: () => {
      $("timeSmartInput").value = $("nowSeconds").textContent;
      previewTimeConversion();
    },
    fillNowDatetime: () => {
      $("timeSmartInput").value = $("nowDisplay").textContent;
      previewTimeConversion();
    },
    fillTimePrimaryResult: () => {
      const value = $("timePrimaryValue").textContent;
      if (!value || value === "-") {
        throw new Error("当前没有可回填的结果");
      }
      $("timeSmartInput").value = value;
      previewTimeConversion();
    },
    clearTimePanels: () => {
      $("timeSmartInput").value = "";
      resetTimeConversionView();
    },
  };
  bindActions(actions);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

async function compressSingleImage(file, quality) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  const mimeType = file.type === "image/png" ? "image/jpeg" : file.type || "image/jpeg";
  const compressedDataUrl = canvas.toDataURL(mimeType, quality);
  const response = await fetch(compressedDataUrl);
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);

  return {
    originalSize: file.size,
    compressedSize: blob.size,
    downloadUrl,
    fileName: file.name.replace(/\.[^.]+$/, "") + (mimeType === "image/jpeg" ? "-compressed.jpg" : "-compressed.webp"),
  };
}

function renderCompressResults(items) {
  const container = $("compressResult");
  if (!items.length) {
    container.className = "result-list empty-state";
    container.textContent = "没有可展示的压缩结果";
    return;
  }
  container.className = "result-list";
  container.innerHTML = "";
  items.forEach((item) => {
    const reduction = item.originalSize ? (((item.originalSize - item.compressedSize) / item.originalSize) * 100).toFixed(1) : "0.0";
    const element = document.createElement("div");
    element.className = "result-item";
    element.innerHTML = `
      <strong>${item.fileName}</strong>
      <div class="meta">原始大小：${formatBytes(item.originalSize)} ｜ 压缩后：${formatBytes(item.compressedSize)} ｜ 缩减：${reduction}%</div>
      <div class="action-row">
        <a href="${item.downloadUrl}" download="${item.fileName}">下载</a>
      </div>
    `;
    container.appendChild(element);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extractImageUrls(text) {
  const pattern = /\bhttps?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|bmp|webp|svg)(?:\?[^\s"'<>]*)?/gi;
  return Array.from(new Set(text.match(pattern) || []));
}

function updateImageCompareStats() {
  const total = state.parsedImageItems.length;
  const loaded = state.parsedImageItems.filter((item) => item.status === "loaded").length;
  const failed = state.parsedImageItems.filter((item) => item.status === "failed").length;
  setText("imageTotalCount", total);
  setText("imageLoadedCount", loaded);
  setText("imageFailedCount", failed);
}

function applyImageCompareLayout() {
  const container = $("imageCompareResult");
  const safeColumns = Math.max(4, Number(state.imageCompareSettings.columns) || 4);
  const safeZoom = Math.min(180, Math.max(60, Number(state.imageCompareSettings.zoom) || 60));
  const { failedOnly } = state.imageCompareSettings;
  state.imageCompareSettings.columns = safeColumns;
  state.imageCompareSettings.zoom = safeZoom;
  container.style.setProperty("--image-columns", String(safeColumns));
  container.style.setProperty("--preview-height", `${Math.round((safeZoom / 100) * 240)}px`);
  setText("imageCompareZoomValue", `${safeZoom}%`);
  $("imageCompareColumns").value = String(safeColumns);
  $("imageCompareZoom").value = String(safeZoom);
  $("toggleFailedOnlyBtn").textContent = failedOnly ? "查看全部" : "只看失败";
}

function setImageCardState(card, item) {
  const statusLabel = card.querySelector(".image-status");
  const placeholder = card.querySelector(".image-placeholder");
  card.classList.remove("loading", "loaded", "failed");
  card.classList.add(item.status);
  statusLabel.className = `image-status ${item.status}`;
  if (item.status === "loaded") {
    statusLabel.textContent = "加载成功";
    placeholder.textContent = "";
    return;
  }
  if (item.status === "failed") {
    statusLabel.textContent = "加载失败";
    placeholder.textContent = `图片加载失败\n${item.url}`;
    return;
  }
  statusLabel.textContent = "加载中";
  placeholder.textContent = "";
}

function createImageCard(item, index) {
  const card = document.createElement("div");
  card.className = "image-card loading";
  card.innerHTML = `
    <span class="image-status loading">加载中</span>
    <img src="${item.url}" alt="image-${index}" loading="lazy" referrerpolicy="no-referrer" />
    <div class="image-placeholder"></div>
    <div class="meta">${item.url}</div>
  `;
  const image = card.querySelector("img");
  const syncStatus = (status) => {
    if (item.status === status) {
      return;
    }
    item.status = status;
    setImageCardState(card, item);
    updateImageCompareStats();
  };
  image.addEventListener("load", () => syncStatus("loaded"), { once: true });
  image.addEventListener("error", () => syncStatus("failed"), { once: true });
  setImageCardState(card, item);
  return card;
}

function renderImageCompare() {
  const container = $("imageCompareResult");
  const totalItems = state.parsedImageItems.length;
  applyImageCompareLayout();
  updateImageCompareStats();

  if (!totalItems) {
    container.className = "image-compare-grid empty-state";
    container.textContent = "没有解析到图片地址";
    return;
  }

  const items = state.imageCompareSettings.failedOnly
    ? state.parsedImageItems.filter((item) => item.status === "failed")
    : state.parsedImageItems;

  if (!items.length) {
    container.className = "image-compare-grid empty-state";
    container.textContent = "当前没有失败图片";
    return;
  }

  container.className = "image-compare-grid";
  container.innerHTML = "";
  items.forEach((item, index) => {
    container.appendChild(createImageCard(item, index));
  });
}

function bindImageActions() {
  $("compressQuality").addEventListener("input", (event) => {
    $("compressQualityValue").textContent = `${event.target.value}%`;
  });
  $("imageCompareZoom").addEventListener("input", (event) => {
    state.imageCompareSettings.zoom = Number(event.target.value);
    applyImageCompareLayout();
  });
  $("imageCompareColumns").addEventListener("change", (event) => {
    state.imageCompareSettings.columns = Number(event.target.value);
    applyImageCompareLayout();
  });
  applyImageCompareLayout();
  updateImageCompareStats();

  const actions = {
    compressImages: async () => {
      const files = Array.from($("imageCompressInput").files || []);
      if (!files.length) {
        throw new Error("请先选择图片");
      }
      const quality = Number($("compressQuality").value) / 100;
      const results = [];
      for (const file of files) {
        results.push(await compressSingleImage(file, quality));
      }
      renderCompressResults(results);
      showToast(`已压缩 ${results.length} 张图片`);
    },
    parseImageUrls: () => {
      state.parsedImageUrls = extractImageUrls($("imageUrlInput").value);
      state.parsedImageItems = state.parsedImageUrls.map((url) => ({
        url,
        status: "loading",
      }));
      state.imageCompareSettings.failedOnly = false;
      renderImageCompare();
      showToast(`解析到 ${state.parsedImageUrls.length} 张图片`);
    },
    copyParsedImageUrls: async () => {
      if (!state.parsedImageUrls.length) {
        throw new Error("请先解析图片地址");
      }
      await copyText(state.parsedImageUrls.join("\n"));
      showToast("图片地址已复制");
    },
    toggleFailedOnly: () => {
      if (!state.parsedImageItems.length) {
        throw new Error("请先解析图片地址");
      }
      if (state.parsedImageItems.some((item) => item.status === "loading")) {
        throw new Error("请等待图片加载完成后再筛选失败项");
      }
      state.imageCompareSettings.failedOnly = !state.imageCompareSettings.failedOnly;
      renderImageCompare();
    },
  };
  bindActions(actions);
}

function updateFapiaoPageSizeUi() {
  const isCustom = $("fapiaoPageSize").value === "custom";
  $("fapiaoCustomWidthGroup").classList.toggle("hidden-field", !isCustom);
  $("fapiaoCustomHeightGroup").classList.toggle("hidden-field", !isCustom);
}

function getFapiaoPageSizeMM() {
  const mode = $("fapiaoPageSize").value;
  if (mode === "a4") {
    return { w: 210, h: 297 };
  }
  if (mode === "a5") {
    return { w: 148, h: 210 };
  }
  return {
    w: (parseFloat($("fapiaoPageWidth").value) || 21) * 10,
    h: (parseFloat($("fapiaoPageHeight").value) || 29.7) * 10,
  };
}

function getFapiaoImageConfig() {
  return {
    wMM: (parseFloat($("fapiaoImgWidth").value) || 21) * 10,
    hMM: (parseFloat($("fapiaoImgHeight").value) || 11) * 10,
    gapMM: (parseFloat($("fapiaoImgGap").value) || 0) * 10,
    xMM: (parseFloat($("fapiaoImgOffsetX").value) || 0) * 10,
  };
}

function setFapiaoGenerateEnabled(enabled) {
  $("fapiaoGeneratePdfBtn").disabled = !enabled;
  $("fapiaoGenerateWordBtn").disabled = !enabled;
}

function showFapiaoProgress(message, type = "") {
  const progress = $("fapiaoProgress");
  progress.textContent = message;
  progress.className = `fapiao-progress${type ? ` ${type}` : ""}`;
  clearTimeout(state.fapiaoProgressTimer);
  if (type === "success" || type === "error") {
    state.fapiaoProgressTimer = setTimeout(() => {
      progress.textContent = "";
      progress.className = "fapiao-progress";
    }, 4000);
  }
}

function renderFapiaoPreview() {
  const previewList = $("fapiaoPreviewList");
  const files = state.fapiaoImageFiles;
  previewList.innerHTML = "";
  setText("fapiaoFileCount", `${files.length} 张`);
  $("fapiaoClearBtn").style.display = files.length ? "" : "none";
  setFapiaoGenerateEnabled(files.length > 0);

  if (!files.length) {
    previewList.className = "fapiao-preview-list empty-state";
    previewList.textContent = "尚未添加文件";
    return;
  }

  previewList.className = "fapiao-preview-list";
  files.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "fapiao-preview-item";
    item.draggable = true;
    item.dataset.index = String(index);

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.src = URL.createObjectURL(file);
    thumb.alt = file.name;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = file.name;

    const size = document.createElement("span");
    size.className = "size";
    size.textContent = formatBytes(file.size);

    const delBtn = document.createElement("button");
    delBtn.className = "del-btn";
    delBtn.type = "button";
    delBtn.innerHTML = "&times;";
    delBtn.title = "移除此图片";
    delBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      state.fapiaoImageFiles.splice(index, 1);
      renderFapiaoPreview();
    });

    item.appendChild(thumb);
    item.appendChild(name);
    item.appendChild(size);
    item.appendChild(delBtn);

    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(index));
      item.style.opacity = "0.4";
    });
    item.addEventListener("dragend", () => {
      item.style.opacity = "1";
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const fromIdx = parseInt(event.dataTransfer.getData("text/plain"), 10);
      const toIdx = index;
      if (fromIdx !== toIdx) {
        const [moved] = state.fapiaoImageFiles.splice(fromIdx, 1);
        state.fapiaoImageFiles.splice(toIdx, 0, moved);
        renderFapiaoPreview();
      }
    });

    previewList.appendChild(item);
  });
}

async function renderPdfPageAsImage(pdf, pageNum, pdfFileName) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  return new File([blob], `${pdfFileName.replace(/\.pdf$/i, "")}_第${pageNum}页.png`, { type: "image/png" });
}

async function parseFapiaoPdfFile(pdfFile) {
  const buffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    try {
      pages.push(await renderPdfPageAsImage(pdf, pageNum, pdfFile.name));
    } catch (error) {
      console.error(`PDF 第 ${pageNum} 页解析失败`, error);
    }
  }
  return pages;
}

async function addFapiaoFiles(fileList) {
  const imgFiles = [];
  const pdfFiles = [];
  Array.from(fileList).forEach((file) => {
    if (file.type.startsWith("image/")) {
      imgFiles.push(file);
      return;
    }
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      pdfFiles.push(file);
    }
  });

  if (imgFiles.length) {
    state.fapiaoImageFiles = state.fapiaoImageFiles.concat(imgFiles);
  }

  if (!pdfFiles.length) {
    if (!imgFiles.length) {
      showFapiaoProgress("未识别到支持的图片或 PDF 文件", "error");
    }
    renderFapiaoPreview();
    return;
  }

  setFapiaoGenerateEnabled(false);
  showFapiaoProgress("正在解析 PDF...", "");

  for (const pdfFile of pdfFiles) {
    showFapiaoProgress(`正在解析 PDF: ${pdfFile.name}...`, "");
    try {
      const pages = await parseFapiaoPdfFile(pdfFile);
      state.fapiaoImageFiles = state.fapiaoImageFiles.concat(pages);
    } catch (error) {
      showFapiaoProgress(`PDF 解析失败: ${error.message}`, "error");
    }
  }

  renderFapiaoPreview();
  showFapiaoProgress("PDF 解析完成", "success");
}

async function resizeFapiaoImage(file, imgW, imgH, quality = 0.92) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = 2;
  const cw = Math.round((imgW * scale) / 25.4 * 96);
  const ch = Math.round((imgH * scale) / 25.4 * 96);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, cw, ch);
  return canvas.toDataURL("image/jpeg", quality);
}

async function generateFapiaoPdf() {
  if (!state.fapiaoImageFiles.length) {
    throw new Error("请先添加发票图片");
  }

  const { w: pageW, h: pageH } = getFapiaoPageSizeMM();
  const { wMM: imgW, hMM: imgH, gapMM: gap, xMM } = getFapiaoImageConfig();

  setFapiaoGenerateEnabled(false);
  showFapiaoProgress("正在生成 PDF...", "");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    unit: "mm",
    format: [pageW, pageH],
    hotfixes: ["px_scaling"],
  });

  let curY = 0;
  for (let index = 0; index < state.fapiaoImageFiles.length; index += 1) {
    if (curY + imgH > pageH) {
      doc.addPage([pageW, pageH]);
      curY = 0;
    }
    showFapiaoProgress(`正在处理第 ${index + 1}/${state.fapiaoImageFiles.length} 张图片...`, "");
    const jpegData = await resizeFapiaoImage(state.fapiaoImageFiles[index], imgW, imgH);
    doc.addImage(jpegData, "JPEG", xMM, curY, imgW, imgH);
    curY += imgH + gap;
  }

  showFapiaoProgress(`PDF 生成完成（共 ${doc.getNumberOfPages()} 页），正在下载...`, "success");
  doc.save(`发票合并_${new Date().toISOString().slice(0, 10)}.pdf`);
  setFapiaoGenerateEnabled(true);
  showToast("PDF 已生成");
}

function buildFapiaoWordLayout(pageH, imgH, gap) {
  const layout = [];
  let curY = 0;
  let curPageImgs = [];
  for (let index = 0; index < state.fapiaoImageFiles.length; index += 1) {
    if (curY + imgH > pageH) {
      layout.push(curPageImgs);
      curPageImgs = [];
      curY = 0;
    }
    curPageImgs.push(index);
    curY += imgH + gap;
  }
  if (curPageImgs.length) {
    layout.push(curPageImgs);
  }
  return layout;
}

function buildFapiaoWordDocumentXml(layout, pageW, pageH, imgW, imgH, xMM, totalImages) {
  const emuPerMm = 36000;
  const imgEmuW = Math.round(imgW * emuPerMm);
  const imgEmuH = Math.round(imgH * emuPerMm);
  const pageTwipsW = Math.round((pageW * 1440) / 25.4);
  const pageTwipsH = Math.round((pageH * 1440) / 25.4);
  const indentTwips = Math.round((xMM * 1440) / 25.4);

  let docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  docXml +=
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
    ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"' +
    ' mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh wp14">';
  docXml += "<w:body>";

  let docPrId = 1;
  layout.forEach((imgs, pageIndex) => {
    imgs.forEach((imgIdx) => {
      docXml += "<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\"/><w:jc w:val=\"left\"/>";
      if (indentTwips > 0) {
        docXml += `<w:ind w:left="${indentTwips}"/>`;
      }
      docXml += "</w:pPr><w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\">";
      docXml += `<wp:extent cx="${imgEmuW}" cy="${imgEmuH}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`;
      docXml += `<wp:docPr id="${docPrId}" name="Picture ${docPrId}"/><wp:cNvGraphicFramePr/>`;
      docXml += "<a:graphic><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">";
      docXml += "<pic:pic><pic:nvPicPr>";
      docXml += `<pic:cNvPr id="0" name="img${imgIdx}.jpeg"/><pic:cNvPicPr/>`;
      docXml += "</pic:nvPicPr><pic:blipFill>";
      docXml += `<a:blip r:embed="rId_img${imgIdx}"/><a:stretch><a:fillRect/></a:stretch>`;
      docXml += "</pic:blipFill><pic:spPr>";
      docXml += `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${imgEmuW}" cy="${imgEmuH}"/></a:xfrm>`;
      docXml += '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
      docXml += "</pic:spPr></pic:pic></a:graphicData></a:graphic>";
      docXml += "</wp:inline></w:drawing></w:r></w:p>";
      docPrId += 1;
    });
    if (pageIndex < layout.length - 1) {
      docXml += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }
  });

  docXml += `<w:sectPr><w:pgSz w:w="${pageTwipsW}" w:h="${pageTwipsH}"/>`;
  docXml += '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/>';
  docXml += "</w:sectPr></w:body></w:document>";
  return docXml;
}

async function generateFapiaoWord() {
  if (!state.fapiaoImageFiles.length) {
    throw new Error("请先添加发票图片");
  }

  const { w: pageW, h: pageH } = getFapiaoPageSizeMM();
  const { wMM: imgW, hMM: imgH, gapMM: gap, xMM } = getFapiaoImageConfig();
  const totalImages = state.fapiaoImageFiles.length;
  const layout = buildFapiaoWordLayout(pageH, imgH, gap);

  setFapiaoGenerateEnabled(false);
  showFapiaoProgress("正在生成 Word...", "");

  const resizedCache = {};
  for (let index = 0; index < totalImages; index += 1) {
    showFapiaoProgress(`正在处理图片 ${index + 1}/${totalImages}...`, "");
    const targetAspect = imgW / imgH;
    const dataUrl = await readFileAsDataUrl(state.fapiaoImageFiles[index]);
    const image = await loadImage(dataUrl);
    const ch = Math.round((imgH * 2) / 25.4 * 96);
    const cw = Math.round(ch * targetAspect);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, cw, ch);
    resizedCache[index] = canvas.toDataURL("image/jpeg", 0.92);
  }

  showFapiaoProgress("正在构建 Word 文档...", "");

  const zip = new JSZip();
  let contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  contentTypes += '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
  contentTypes +=
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>';
  contentTypes += '<Default Extension="jpeg" ContentType="image/jpeg"/>';
  contentTypes +=
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>';
  contentTypes += "</Types>";
  zip.file("[Content_Types].xml", contentTypes);

  let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  rels += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  rels +=
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>';
  rels += "</Relationships>";
  zip.folder("_rels").file(".rels", rels);

  let docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  docRels += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  for (let index = 0; index < totalImages; index += 1) {
    docRels += `<Relationship Id="rId_img${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${index}.jpeg"/>`;
  }
  docRels += "</Relationships>";
  zip.folder("word").folder("_rels").file("document.xml.rels", docRels);

  const mediaFolder = zip.folder("word").folder("media");
  for (let index = 0; index < totalImages; index += 1) {
    const base64 = resizedCache[index].replace(/^data:image\/\w+;base64,/, "");
    mediaFolder.file(`img${index}.jpeg`, base64, { base64: true });
  }

  zip.file("word/document.xml", buildFapiaoWordDocumentXml(layout, pageW, pageH, imgW, imgH, xMM, totalImages));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `发票合并_${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  showFapiaoProgress(`Word 下载完成（共 ${layout.length} 页）`, "success");
  setFapiaoGenerateEnabled(true);
  showToast("Word 已生成");
}

function bindFapiaoActions() {
  updateFapiaoPageSizeUi();
  renderFapiaoPreview();

  $("fapiaoPageSize").addEventListener("change", updateFapiaoPageSizeUi);

  const dropZone = $("fapiaoDropZone");
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("active");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("active");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("active");
    if (event.dataTransfer.files.length) {
      addFapiaoFiles(event.dataTransfer.files);
    }
  });

  $("fapiaoFileInput").addEventListener("change", (event) => {
    if (event.target.files.length) {
      addFapiaoFiles(event.target.files);
      event.target.value = "";
    }
  });

  const actions = {
    generateFapiaoPdf: () => generateFapiaoPdf(),
    generateFapiaoWord: () => generateFapiaoWord(),
    clearFapiaoList: () => {
      state.fapiaoImageFiles = [];
      renderFapiaoPreview();
      showFapiaoProgress("列表已清空", "success");
    },
  };
  bindActions(actions);
}

function parseFieldList(input) {
  return input
    .split(/[\n,，;；]/)
    .map((field) => field.trim())
    .filter(Boolean);
}

function getValueByPath(source, path) {
  if (!path) {
    return undefined;
  }
  return path.split(".").reduce((current, key) => {
    if (current == null) {
      return undefined;
    }
    return current[key];
  }, source);
}

function setValueByPath(target, path, value) {
  const keys = path.split(".");
  let current = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  });
}

function pickSourceFields(source, fieldPaths) {
  if (!fieldPaths.length || source == null || typeof source !== "object") {
    return source;
  }
  const picked = {};
  let matched = 0;
  fieldPaths.forEach((path) => {
    const value = getValueByPath(source, path);
    if (value !== undefined) {
      setValueByPath(picked, path, value);
      matched += 1;
    }
  });
  return matched ? picked : {};
}

function buildEsDocument(record, source, fallbackId, idField, sourceFields) {
  const sourceData = pickSourceFields(source, sourceFields);
  const resolvedId =
    record?._id ??
    getValueByPath(record, idField) ??
    getValueByPath(source, idField) ??
    fallbackId;

  return {
    id: String(resolvedId),
    index: record?._index ?? "",
    source: sourceData,
  };
}

function normalizeEsDocuments(input, idField, sourceFields) {
  if (Array.isArray(input)) {
    return input.map((item, index) =>
      buildEsDocument(item, item && typeof item === "object" && "_source" in item ? item._source : item, index + 1, idField, sourceFields)
    );
  }

  if (input?.hits?.hits && Array.isArray(input.hits.hits)) {
    return input.hits.hits.map((hit, index) =>
      buildEsDocument(hit, hit._source ?? hit.fields ?? hit, index + 1, idField, sourceFields)
    );
  }

  if (input && typeof input === "object") {
    return [buildEsDocument(input, input._source ?? input, 1, idField, sourceFields)];
  }

  throw new Error("无法识别 ES 查询结果格式");
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = (baseUrl || "").trim() || "http://localhost:9200";
  return trimmed.replace(/\/+$/, "");
}

function encodeEsPathSegment(value) {
  return encodeURIComponent(String(value));
}

function ensureTrailingNewline(value) {
  if (!value) {
    return "";
  }
  return value.endsWith("\n") ? value : `${value}\n`;
}

function countOutputLines(value) {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed ? trimmed.split("\n").length : 0;
}

const esModeLabels = {
  index: "Index API",
  update: "Update API",
  bulkIndex: "Bulk Index",
  bulkUpdate: "Bulk Update",
  bulkDelete: "Bulk Delete",
};

const esOutputStyleLabels = {
  console: "Kibana Console",
  curl: "cURL (bash)",
  curlPowerShell: "cURL (PowerShell)",
};

function syncEsSelectionMeta() {
  setText("esModeLabel", esModeLabels[$("esMode").value] || "-");
  setText("esFormatLabel", esOutputStyleLabels[$("esOutputStyle").value] || "-");
}

function resetEsOutputMeta() {
  setText("esDocumentCount", 0);
  setText("esOutputLineCount", 0);
  syncEsSelectionMeta();
}

function updateEsOutputMeta(documents, output) {
  setText("esDocumentCount", documents.length);
  setText("esOutputLineCount", countOutputLines(output));
  syncEsSelectionMeta();
}

function buildEsConsoleOutput(documents, mode, targetIndexName) {
  const lines = [];
  documents.forEach((doc) => {
    const indexName = targetIndexName || doc.index || "your_index";
    const encodedId = encodeEsPathSegment(doc.id);
    if (mode === "index") {
      lines.push(`PUT /${indexName}/_doc/${encodedId}`);
      lines.push(JSON.stringify(doc.source, null, 2));
      return;
    }
    if (mode === "update") {
      lines.push(`POST /${indexName}/_update/${encodedId}`);
      lines.push(
        JSON.stringify(
          {
            doc: doc.source,
            doc_as_upsert: true,
          },
          null,
          2
        )
      );
      return;
    }
    if (mode === "bulkIndex") {
      lines.push(JSON.stringify({ index: { _index: indexName, _id: doc.id } }));
      lines.push(JSON.stringify(doc.source));
      return;
    }
    if (mode === "bulkUpdate") {
      lines.push(JSON.stringify({ update: { _index: indexName, _id: doc.id } }));
      lines.push(JSON.stringify({ doc: doc.source, doc_as_upsert: true }));
      return;
    }
    if (mode === "bulkDelete") {
      lines.push(JSON.stringify({ delete: { _index: indexName, _id: doc.id } }));
    }
  });
  const output = lines.join("\n");
  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    return ensureTrailingNewline(output);
  }
  return output;
}

function buildCurlRequest(method, url, body, contentType = "application/json") {
  if (!body) {
    return `curl -X ${method} "${url}"`;
  }

  const bashSafeBody = String(body).replace(/'/g, `'\"'\"'`);

  return [
    `curl -X ${method} "${url}" \\`,
    `  -H "Content-Type: ${contentType}" \\`,
    `  --data-binary '${bashSafeBody}'`,
  ].join("\n");
}

function buildEsCurlOutput(documents, mode, targetIndexName, baseUrl) {
  const rootUrl = normalizeBaseUrl(baseUrl);

  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    const ndjsonBody = buildEsConsoleOutput(documents, mode, targetIndexName);
    return buildCurlRequest(
      "POST",
      `${rootUrl}/_bulk`,
      ndjsonBody,
      "application/x-ndjson"
    );
  }

  return documents
    .map((doc) => {
      const indexName = targetIndexName || doc.index || "your_index";
      const encodedId = encodeEsPathSegment(doc.id);
      if (mode === "index") {
        return buildCurlRequest(
          "PUT",
          `${rootUrl}/${indexName}/_doc/${encodedId}`,
          JSON.stringify(doc.source, null, 2)
        );
      }
      return buildCurlRequest(
        "POST",
        `${rootUrl}/${indexName}/_update/${encodedId}`,
        JSON.stringify(
          {
            doc: doc.source,
            doc_as_upsert: true,
          },
          null,
          2
        )
      );
    })
    .join("\n\n");
}

function buildPowerShellCurlRequest(method, url, body, contentType = "application/json") {
  if (!body) {
    return `curl.exe -X ${method} "${url}"`;
  }
  return [
    "@'",
    body,
    `'@ | curl.exe -X ${method} "${url}" \``,
    `  -H "Content-Type: ${contentType}" \``,
    "  --data-binary @-",
  ].join("\n");
}

function buildEsPowerShellCurlOutput(documents, mode, targetIndexName, baseUrl) {
  const rootUrl = normalizeBaseUrl(baseUrl);

  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    const ndjsonBody = buildEsConsoleOutput(documents, mode, targetIndexName);
    return buildPowerShellCurlRequest(
      "POST",
      `${rootUrl}/_bulk`,
      ndjsonBody,
      "application/x-ndjson"
    );
  }

  return documents
    .map((doc) => {
      const indexName = targetIndexName || doc.index || "your_index";
      const encodedId = encodeEsPathSegment(doc.id);
      if (mode === "index") {
        return buildPowerShellCurlRequest(
          "PUT",
          `${rootUrl}/${indexName}/_doc/${encodedId}`,
          JSON.stringify(doc.source, null, 2)
        );
      }
      return buildPowerShellCurlRequest(
        "POST",
        `${rootUrl}/${indexName}/_update/${encodedId}`,
        JSON.stringify(
          {
            doc: doc.source,
            doc_as_upsert: true,
          },
          null,
          2
        )
      );
    })
    .join("\n\n");
}

function buildEsOutput(documents, mode, targetIndexName, outputStyle, baseUrl) {
  if (outputStyle === "curl") {
    return buildEsCurlOutput(documents, mode, targetIndexName, baseUrl);
  }
  if (outputStyle === "curlPowerShell") {
    return buildEsPowerShellCurlOutput(documents, mode, targetIndexName, baseUrl);
  }
  return buildEsConsoleOutput(documents, mode, targetIndexName);
}

const httpFormOutputStyleLabels = {
  curl: "cURL (bash)",
  curlPowerShell: "cURL (PowerShell)",
};

const httpInputModeLabels = {
  json: "JSON 请求体",
  getUrl: "GET URL",
};

const httpBodyFormatLabels = {
  form: "Form 表单",
  json: "JSON",
};

const httpFormExample = {
  url: "https://api.example.com/hotel/search",
  getUrl:
    "https://api.example.com/hotel/search?st=1&cityid=2102&key=明都&startdate=2026-07-06&enddate=2026-07-08&p=appstore,ios14.4,kssl,7.8.3,iPhone14.4,0&phoneid=155249246&pn=25&ps=0&shortcut=%5B%7B%22type%22%3A%2219%22%2C%22id%22%3A%5B%22agreementPrice%22%5D%7D%5D&stf=usscore&t=1&tmc=1",
  json: JSON.stringify(
    {
      st: "1",
      cityid: "2102",
      key: "明都",
      startdate: "2026-07-06",
      enddate: "2026-07-08",
      p: "appstore,ios14.4,kssl,7.8.3,iPhone14.4,0",
      phoneid: "155249246",
      pn: "25",
      ps: "0",
      shortcut: '[{"type":"19","id":["agreementPrice"]}]',
      stf: "usscore",
      t: "1",
      tmc: "1",
    },
    null,
    2
  ),
};

function buildFormFieldKey(parentKey, key, keyStyle) {
  if (!parentKey) {
    return String(key);
  }
  if (keyStyle === "dot") {
    return `${parentKey}.${key}`;
  }
  return `${parentKey}[${key}]`;
}

function flattenJsonToFormFields(value, parentKey = "", keyStyle = "bracket", result = []) {
  if (value === null || value === undefined) {
    if (parentKey) {
      result.push([parentKey, ""]);
    }
    return result;
  }

  if (Array.isArray(value)) {
    if (value.length === 0 && parentKey) {
      result.push([parentKey, ""]);
      return result;
    }
    value.forEach((item, index) => {
      flattenJsonToFormFields(item, buildFormFieldKey(parentKey, index, keyStyle), keyStyle, result);
    });
    return result;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0 && parentKey) {
      result.push([parentKey, ""]);
      return result;
    }
    entries.forEach(([key, nestedValue]) => {
      flattenJsonToFormFields(nestedValue, buildFormFieldKey(parentKey, key, keyStyle), keyStyle, result);
    });
    return result;
  }

  result.push([parentKey, String(value)]);
  return result;
}

function buildFormBody(fields) {
  return fields.map(([key, value]) => `${key}=${value}`).join("&");
}

function tryParseJsonValue(value) {
  const text = String(value).trim();
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return value;
    }
  }
  return value;
}

function queryParamsToObject(params, parseJsonValues = false) {
  const result = {};
  Object.entries(params).forEach(([key, value]) => {
    const mapValue = (item) => (parseJsonValues ? tryParseJsonValue(item) : item);
    if (Array.isArray(value)) {
      result[key] = value.map(mapValue);
      return;
    }
    result[key] = mapValue(value);
  });
  return result;
}

function parseGetUrl(input, requireParams = true) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入 GET 请求 URL");
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let urlObject;
  try {
    urlObject = new URL(normalized);
  } catch (error) {
    throw new Error("URL 格式无效");
  }

  const params = {};
  urlObject.searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      if (Array.isArray(params[key])) {
        params[key].push(value);
        return;
      }
      params[key] = [params[key], value];
      return;
    }
    params[key] = value;
  });

  if (requireParams && Object.keys(params).length === 0) {
    throw new Error("GET URL 中未找到查询参数");
  }

  return {
    baseUrl: `${urlObject.origin}${urlObject.pathname}`,
    params,
  };
}

function extractBaseHttpUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入请求 URL");
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const urlObject = new URL(normalized);
    return `${urlObject.origin}${urlObject.pathname}`;
  } catch (error) {
    throw new Error("URL 格式无效");
  }
}

function dataObjectToQueryFields(dataObject, bodyFormat, keyStyle) {
  if (bodyFormat === "form") {
    return flattenJsonToFormFields(dataObject, "", keyStyle);
  }

  return Object.entries(dataObject).map(([key, value]) => {
    if (value === null || value === undefined) {
      return [key, ""];
    }
    if (typeof value === "object") {
      return [key, JSON.stringify(value)];
    }
    return [key, String(value)];
  });
}

function buildQueryString(fields) {
  return buildFormBody(fields);
}

function buildUrlWithQuery(baseUrl, queryString) {
  if (!queryString) {
    return baseUrl;
  }
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${queryString}`;
}

function buildGetCurlRequest(url, outputStyle = "curl") {
  if (outputStyle === "curlPowerShell") {
    return `curl.exe "${url}"`;
  }
  return `curl "${url}"`;
}

function buildJsonCurlRequest(method, url, jsonBody, outputStyle = "curl") {
  if (outputStyle === "curlPowerShell") {
    return buildPowerShellCurlRequest(method, url, jsonBody, "application/json");
  }
  return buildCurlRequest(method, url, jsonBody, "application/json");
}

function buildFormCurlRequest(method, url, formBody, outputStyle = "curl") {
  const contentType = "application/x-www-form-urlencoded";
  if (outputStyle === "curlPowerShell") {
    if (!formBody) {
      return `curl.exe -X ${method} "${url}"`;
    }
    return [
      "@'",
      formBody,
      `'@ | curl.exe -X ${method} "${url}" \``,
      `  -H "Content-Type: ${contentType}" \``,
      "  --data-binary @-",
    ].join("\n");
  }

  if (!formBody) {
    return `curl -X ${method} "${url}"`;
  }

  const bashSafeBody = formBody.replace(/'/g, `'\"'\"'`);
  return [
    `curl -X ${method} "${url}" \\`,
    `  -H "Content-Type: ${contentType}" \\`,
    `  --data '${bashSafeBody}'`,
  ].join("\n");
}

function syncHttpFormMeta(fieldCount) {
  setText("httpFormFieldCount", fieldCount);
  setText("httpOutputMethodLabel", $("httpOutputMethod").value || "POST");
  setText("httpInputModeLabel", httpInputModeLabels[$("httpInputMode").value] || "JSON 请求体");
  setText("httpBodyFormatLabel", httpBodyFormatLabels[$("httpBodyFormat").value] || "Form 表单");
  setText(
    "httpFormFormatLabel",
    httpFormOutputStyleLabels[$("httpFormOutputStyle").value] || "cURL (bash)"
  );
}

function syncHttpInputModeUi() {
  const inputMode = $("httpInputMode").value;
  const bodyFormat = $("httpBodyFormat").value;
  const outputMethod = $("httpOutputMethod").value;
  const isGetUrlMode = inputMode === "getUrl";
  const isGetOutput = outputMethod === "GET";
  const showKeyStyle = bodyFormat === "form" && inputMode === "json";

  $("httpFormJsonGroup").classList.toggle("hidden-field", isGetUrlMode);
  $("httpFormKeyStyleGroup").classList.toggle("hidden-field", !showKeyStyle);
  setText("httpFormUrlLabel", isGetUrlMode ? "GET 请求 URL" : "请求 URL");
  $("httpFormUrl").placeholder = isGetUrlMode
    ? "https://example.com/api/search?cityid=2102&key=明都"
    : "https://example.com/api/submit";

  const hint = $("httpInputModeHint");
  if (isGetUrlMode && isGetOutput) {
    hint.textContent = "GET 输入 + GET 输出：会解析并重新整理查询参数，可按 Form / JSON 格式输出。";
    return;
  }
  if (isGetUrlMode) {
    hint.textContent = "GET 输入 + POST 输出：解析 URL 查询参数，去掉 query 后作为 POST 地址。";
    return;
  }
  if (isGetOutput && bodyFormat === "json") {
    hint.textContent = "JSON 输入 + GET 输出：对象/数组字段会序列化为 JSON 字符串放入 query。";
    return;
  }
  if (isGetOutput) {
    hint.textContent = "JSON 输入 + GET 输出：按嵌套结构扁平化为 query 参数，如 tags[0]=a。";
    return;
  }
  if (bodyFormat === "json") {
    hint.textContent = "JSON 输入 + POST 输出：请求体以 application/json 发送。";
    return;
  }
  hint.textContent = "JSON 输入 + POST 输出：按嵌套结构扁平化为 Form 表单字段。";
}

function resetHttpFormMeta() {
  syncHttpFormMeta(0);
  syncHttpInputModeUi();
}

function runHttpFormCurlConversion() {
  const inputMode = $("httpInputMode").value;
  const bodyFormat = $("httpBodyFormat").value;
  const keyStyle = $("httpFormKeyStyle").value;
  const outputMethod = $("httpOutputMethod").value || "POST";
  const outputStyle = $("httpFormOutputStyle").value;
  const isGetOutput = outputMethod === "GET";

  let baseUrl;
  let dataObject;

  if (inputMode === "getUrl") {
    const parsed = parseGetUrl($("httpFormUrl").value);
    baseUrl = parsed.baseUrl;
    dataObject = queryParamsToObject(parsed.params, bodyFormat === "json");
  } else {
    baseUrl = extractBaseHttpUrl($("httpFormUrl").value);

    const jsonInput = $("httpFormJsonInput").value.trim();
    if (!jsonInput) {
      throw new Error("请输入 JSON 请求体");
    }

    const parsed = safeJsonParse(jsonInput);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("请求体必须是 JSON 对象");
    }
    dataObject = parsed;
  }

  const queryFields = dataObjectToQueryFields(dataObject, bodyFormat, keyStyle);
  if (queryFields.length === 0) {
    throw new Error("无可用参数");
  }

  let bodyPreview;
  let output;

  if (isGetOutput) {
    const queryString = buildQueryString(queryFields);
    const fullUrl = buildUrlWithQuery(baseUrl, queryString);
    bodyPreview = queryString;
    output = buildGetCurlRequest(fullUrl, outputStyle);
  } else if (bodyFormat === "json") {
    bodyPreview = JSON.stringify(dataObject, null, 2);
    output = buildJsonCurlRequest(outputMethod, baseUrl, bodyPreview, outputStyle);
  } else {
    bodyPreview = buildQueryString(queryFields);
    output = buildFormCurlRequest(outputMethod, baseUrl, bodyPreview, outputStyle);
  }

  const fieldCount = queryFields.length;
  setOutput("httpFormBodyPreview", bodyPreview);
  setOutput("httpFormOutput", output);
  syncHttpFormMeta(fieldCount);
  showToast(
    `已生成 ${fieldCount} 个参数的 ${outputMethod} ${httpBodyFormatLabels[bodyFormat] || "Form 表单"} cURL 命令`
  );
}

function bindHttpFormActions() {
  resetHttpFormMeta();
  $("httpInputMode").addEventListener("change", () => {
    syncHttpInputModeUi();
    syncHttpFormMeta($("httpFormFieldCount").textContent || 0);
  });
  $("httpBodyFormat").addEventListener("change", () => {
    syncHttpInputModeUi();
    syncHttpFormMeta($("httpFormFieldCount").textContent || 0);
  });
  $("httpOutputMethod").addEventListener("change", () => {
    syncHttpInputModeUi();
    syncHttpFormMeta($("httpFormFieldCount").textContent || 0);
  });
  $("httpFormOutputStyle").addEventListener("change", () => syncHttpFormMeta($("httpFormFieldCount").textContent || 0));

  const actions = {
    convertHttpFormCurl: () => runHttpFormCurlConversion(),
    fillHttpFormExample: () => {
      const inputMode = $("httpInputMode").value;
      $("httpOutputMethod").value = inputMode === "getUrl" ? "GET" : "POST";
      $("httpFormOutputStyle").value = "curl";
      $("httpFormKeyStyle").value = "bracket";

      if (inputMode === "getUrl") {
        $("httpFormUrl").value = httpFormExample.getUrl;
        $("httpFormJsonInput").value = "";
      } else {
        $("httpFormUrl").value = httpFormExample.url;
        $("httpFormJsonInput").value = httpFormExample.json;
      }

      syncHttpInputModeUi();
      runHttpFormCurlConversion();
    },
    clearHttpFormPanels: () => {
      $("httpFormUrl").value = "";
      $("httpFormJsonInput").value = "";
      $("httpInputMode").value = "json";
      $("httpBodyFormat").value = "form";
      $("httpOutputMethod").value = "POST";
      setOutput("httpFormBodyPreview", "");
      setOutput("httpFormOutput", "");
      resetHttpFormMeta();
      showToast("已清空");
    },
  };
  bindActions(actions);
}

function bindEsActions() {
  resetEsOutputMeta();
  $("esMode").addEventListener("change", syncEsSelectionMeta);
  $("esOutputStyle").addEventListener("change", syncEsSelectionMeta);

  const actions = {
    convertEsData: () => {
      const input = safeJsonParse($("esInput").value);
      const mode = $("esMode").value;
      const outputStyle = $("esOutputStyle").value;
      const sourceFields = mode === "bulkDelete" ? [] : parseFieldList($("esSourceFields").value);
      const documents = normalizeEsDocuments(input, $("esIdField").value.trim(), sourceFields);
      const output = buildEsOutput(documents, mode, $("esIndexName").value.trim(), outputStyle, $("esBaseUrl").value.trim());
      setOutput("esOutput", output);
      updateEsOutputMeta(documents, output);
      showToast(
        `已生成 ${documents.length} 条记录${sourceFields.length ? `，筛选 ${sourceFields.length} 个字段` : ""}，格式：${
          esOutputStyleLabels[outputStyle] || "Kibana Console"
        }`
      );
    },
  };
  bindActions(actions);
}

function bindActions(actions) {
  Object.entries(actions).forEach(([actionName, handler]) => {
    document.querySelectorAll(`[data-action="${actionName}"]`).forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await handler();
        } catch (error) {
          showToast(error.message || "操作失败", true);
        }
      });
    });
  });
}

function bindThemeSwitching() {
  const toggleBtn = $("themeToggleBtn");
  if (!toggleBtn) return;
  
  toggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("dev-toolbox-theme", newTheme);
  });
}

function init() {
  bindThemeSwitching();
  bindCopyButtons();
  bindNavigation();
  bindSubtabs();
  bindEncodingActions();
  bindJsonActions();
  bindSqlActions();
  bindTimeActions();
  bindImageActions();
  bindFapiaoActions();
  bindHttpFormActions();
  bindEsActions();
}

document.addEventListener("DOMContentLoaded", init);
