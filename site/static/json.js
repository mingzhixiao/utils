// json.js — JSON 工具：JSON⇄CSV、树视图、Diff 对比。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。
// 注：jsonEscapeString / jsonUnescapeString 已迁移至 core.js（共享基础模块）。

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


function parseCsvDocument(csv) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  const endCell = () => {
    row.push(current);
    current = "";
  };
  const endRow = () => {
    rows.push(row);
    row = [];
  };
  let i = 0;
  while (i < csv.length) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 2;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }
    if (!inQuotes && char === "\r") {
      endCell();
      endRow();
      i += next === "\n" ? 2 : 1;
      continue;
    }
    if (!inQuotes && char === "\n") {
      endCell();
      endRow();
      i += 1;
      continue;
    }
    if (!inQuotes && char === ",") {
      endCell();
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  endCell();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    endRow();
  }
  return rows;
}


function csvToJson(csv) {
  const rows = parseCsvDocument(csv).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length < 2) {
    throw new Error("CSV 至少需要表头和一行数据");
  }
  const headers = rows[0];
  const dataRows = rows.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
  return JSON.stringify(dataRows, null, 2);
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

