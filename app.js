const state = {
  parsedImageUrls: [],
  parsedImageItems: [],
  encodingType: "url",
  imageCompareSettings: {
    columns: 2,
    zoom: 100,
    failedOnly: false,
  },
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
  $("scrollTopBtn").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    encode: (value) => encodeURIComponent(value),
    decode: (value) => decodeURIComponent(value),
  },
  unicode: {
    badge: "Unicode",
    name: "Unicode 编码 / 解码",
    hint: "适合处理带 \\uXXXX 的转义文本和中文字符互转。",
    placeholder: "输入中文，或 \\u4f60\\u597d 这样的文本",
    encode: (value) => toUnicodeEscape(value),
    decode: (value) => fromUnicodeEscape(value),
  },
  base64: {
    badge: "Base64",
    name: "Base64 编码 / 解码",
    hint: "适合处理接口传输文本、调试 token 片段和简单文本封装。",
    placeholder: "输入任意 UTF-8 文本或 Base64 内容",
    encode: (value) => encodeBase64Utf8(value),
    decode: (value) => decodeBase64Utf8(value),
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
  updateEncodingOutputMeta(result, direction === "encode" ? "原文 → 编码" : "编码 → 原文");
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
    jsonEscape: () => setOutput("jsonOutput", jsonEscapeString($("jsonInput").value)),
    jsonUnescape: () => setOutput("jsonOutput", jsonUnescapeString($("jsonInput").value)),
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
  const { columns, zoom, failedOnly } = state.imageCompareSettings;
  container.style.setProperty("--image-columns", String(columns));
  container.style.setProperty("--preview-height", `${Math.round((zoom / 100) * 240)}px`);
  setText("imageCompareZoomValue", `${zoom}%`);
  $("imageCompareColumns").value = String(columns);
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

function buildEsConsoleOutput(documents, mode, targetIndexName) {
  const lines = [];
  documents.forEach((doc) => {
    const indexName = targetIndexName || doc.index || "your_index";
    if (mode === "index") {
      lines.push(`PUT /${indexName}/_doc/${doc.id}`);
      lines.push(JSON.stringify(doc.source, null, 2));
      return;
    }
    if (mode === "update") {
      lines.push(`POST /${indexName}/_update/${doc.id}`);
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
  return lines.join("\n");
}

function buildCurlRequest(method, url, body, contentType = "application/json") {
  if (!body) {
    return `curl -X ${method} "${url}"`;
  }
  return [
    `curl -X ${method} "${url}" \\`,
    `  -H "Content-Type: ${contentType}" \\`,
    "  --data-binary @- <<'JSON'",
    body,
    "JSON",
  ].join("\n");
}

function buildEsCurlOutput(documents, mode, targetIndexName, baseUrl) {
  const rootUrl = normalizeBaseUrl(baseUrl);

  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    const ndjsonBody = buildEsConsoleOutput(documents, mode, targetIndexName);
    return [
      `curl -X POST "${rootUrl}/_bulk" \\`,
      '  -H "Content-Type: application/x-ndjson" \\',
      "  --data-binary @- <<'NDJSON'",
      ndjsonBody,
      "NDJSON",
    ].join("\n");
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

function buildEsOutput(documents, mode, targetIndexName, outputStyle, baseUrl) {
  if (outputStyle === "curl") {
    return buildEsCurlOutput(documents, mode, targetIndexName, baseUrl);
  }
  return buildEsConsoleOutput(documents, mode, targetIndexName);
}

function bindEsActions() {
  const actions = {
    convertEsData: () => {
      const input = safeJsonParse($("esInput").value);
      const mode = $("esMode").value;
      const outputStyle = $("esOutputStyle").value;
      const sourceFields = mode === "bulkDelete" ? [] : parseFieldList($("esSourceFields").value);
      const documents = normalizeEsDocuments(input, $("esIdField").value.trim(), sourceFields);
      const output = buildEsOutput(documents, mode, $("esIndexName").value.trim(), outputStyle, $("esBaseUrl").value.trim());
      setOutput("esOutput", output);
      showToast(
        `已生成 ${documents.length} 条记录${sourceFields.length ? `，筛选 ${sourceFields.length} 个字段` : ""}，格式：${
          outputStyle === "curl" ? "cURL" : "Kibana Console"
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

function init() {
  bindCopyButtons();
  bindNavigation();
  bindSubtabs();
  bindEncodingActions();
  bindJsonActions();
  bindTimeActions();
  bindImageActions();
  bindEsActions();
  bindActions({
    openOptionsPage: () => {
      if (globalThis.chrome?.runtime?.openOptionsPage) {
        globalThis.chrome.runtime.openOptionsPage();
        return;
      }
      window.open("popup.html", "_blank");
    },
  });
}

document.addEventListener("DOMContentLoaded", init);
