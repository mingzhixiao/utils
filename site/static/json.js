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


// —— JSON 路径提取 ——
// 支持语法：
//   $              根节点（或省略）
//   .key / key     按键取值（可直接以键名开头）
//   ["k"] / ['k'] 含特殊字符的键
//   [n]            数组下标（支持负数 -1 表示末位）
//   [*]            数组通配，对数组每个元素应用后续路径，结果收集为数组
function parseJsonPathSegments(path) {
  const segments = [];
  const source = String(path).trim();
  let i = 0;
  if (source === "$") {
    return segments;
  }
  if (source[0] === "$") {
    i = 1;
  }
  while (i < source.length) {
    const char = source[i];
    if (char === ".") {
      let j = i + 1;
      while (j < source.length && source[j] !== "." && source[j] !== "[") {
        j += 1;
      }
      const key = source.slice(i + 1, j);
      if (key === "") {
        throw new Error(`路径语法错误：${source.slice(i, i + 8)}`);
      }
      segments.push({ type: "key", value: key });
      i = j;
    } else if (char === "[") {
      const close = source.indexOf("]", i);
      if (close === -1) {
        throw new Error("路径缺少右括号 ]");
      }
      const inner = source.slice(i + 1, close).trim();
      const quoteMatch = inner.match(/^["'](.*)["']$/);
      if (quoteMatch) {
        segments.push({ type: "key", value: quoteMatch[1] });
      } else if (inner === "*") {
        segments.push({ type: "wild", value: "*" });
      } else if (/^-?\d+$/.test(inner)) {
        segments.push({ type: "index", value: parseInt(inner, 10) });
      } else {
        throw new Error(`无效的数组下标：${inner}`);
      }
      i = close + 1;
    } else {
      let j = i;
      while (j < source.length && source[j] !== "." && source[j] !== "[") {
        j += 1;
      }
      const key = source.slice(i, j);
      if (key === "") {
        throw new Error(`路径语法错误：${source.slice(i, i + 8)}`);
      }
      segments.push({ type: "key", value: key });
      i = j;
    }
  }
  return segments;
}


function describeExtractedType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  return typeof value;
}


function applyJsonPathSegments(value, segments, start) {
  if (start >= segments.length) {
    return value;
  }
  const segment = segments[start];
  if (segment.type === "wild") {
    if (!Array.isArray(value)) {
      throw new Error("通配符 [*] 只能用于数组");
    }
    return value.map((item) => applyJsonPathSegments(item, segments, start + 1));
  }

  let next;
  if (segment.type === "key") {
    if (value === null || typeof value !== "object") {
      throw new Error(`无法从 ${value === null ? "null" : typeof value} 中按键 "${segment.value}" 取值`);
    }
    if (!(segment.value in value)) {
      throw new Error(`键 "${segment.value}" 不存在`);
    }
    next = value[segment.value];
  } else {
    if (!Array.isArray(value)) {
      throw new Error(`下标 [${segment.value}] 只能用于数组`);
    }
    let index = segment.value;
    if (index < 0) {
      index = value.length + index;
    }
    if (index < 0 || index >= value.length) {
      throw new Error(`数组下标越界：[${segment.value}]（长度 ${value.length}）`);
    }
    next = value[index];
  }
  return applyJsonPathSegments(next, segments, start + 1);
}


function extractJsonByPath(jsonValue, path) {
  const trimmed = path == null ? "" : String(path).trim();
  if (trimmed === "" || trimmed === "$") {
    return jsonValue;
  }
  const segments = parseJsonPathSegments(trimmed);
  if (!segments.length) {
    return jsonValue;
  }
  return applyJsonPathSegments(jsonValue, segments, 0);
}


function parseJsonFieldSpecs(text) {
  return String(text)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      const match = part.match(/^([\p{L}\p{N}_$][\p{L}\p{N}_$]*)\s*:\s*(.+)$/u);
      const raw = match ? match[2].trim() : part;
      // 子路径以 $ 开头表示从根节点取值（跨层引用），否则从当前元素取值。
      const fromRoot = raw[0] === "$";
      return { alias: match ? match[1] : null, subpath: raw, fromRoot };
    });
}


function lastSegmentAlias(subpath) {
  const segments = parseJsonPathSegments(subpath);
  const last = segments[segments.length - 1];
  if (last && last.type === "key") {
    return last.value;
  }
  return subpath;
}


// 批量投影提取：以 basePath 解析出的每个元素（或单个对象）为基准，
// 按 fields 中列出的子路径取出对应值，组装成对象；basePath 留空则使用整份 JSON。
// fields 形如 "name, roles" 或 "用户名:name, 角色:roles"，支持 别名:子路径。
// 子路径以 $ 开头（如 $["store name"]）表示从根节点取值，可将根上的字段拼进每条结果，
// 实现类似 [{ "store name": <根>, "name": <元素> }, ...] 的跨层组合。
function extractJsonProjection(root, basePath, fieldsText) {
  const baseSegments = parseJsonPathSegments(basePath == null ? "" : String(basePath).trim());
  const baseValue = baseSegments.length
    ? applyJsonPathSegments(root, baseSegments, 0)
    : root;
  const specs = parseJsonFieldSpecs(fieldsText);
  if (!specs.length) {
    throw new Error("请至少填写一个字段");
  }

  const projectOne = (element) => {
    const result = {};
    specs.forEach((spec) => {
      const alias = spec.alias || lastSegmentAlias(spec.subpath);
      const source = spec.fromRoot ? root : element;
      const segments = parseJsonPathSegments(spec.subpath);
      result[alias] = segments.length ? applyJsonPathSegments(source, segments, 0) : source;
    });
    return result;
  };

  if (Array.isArray(baseValue)) {
    return baseValue.map(projectOne);
  }
  return projectOne(baseValue);
}


const JSON_EXTRACT_EXAMPLE = {
  users: [
    { id: 1, name: "Alice", roles: ["admin", "user"] },
    { id: 2, name: "Bob", roles: ["user"] },
  ],
  "store name": "Main Store",
  meta: { total: 2 },
};


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
    jsonExtract: () => {
      const parsed = safeJsonParse($("jsonExtractInput").value);
      const path = $("jsonExtractPath").value.trim();
      const result = extractJsonByPath(parsed, path);
      setOutput("jsonExtractOutput", JSON.stringify(result, null, 2));
      setText("jsonExtractPathOut", path || "$");
      setText("jsonExtractType", describeExtractedType(result));
      showToast("提取成功");
    },
    fillJsonExtractExample: () => {
      setOutput("jsonExtractInput", JSON.stringify(JSON_EXTRACT_EXAMPLE, null, 2));
      setOutput("jsonExtractPath", "$.users[0].name");
      $("jsonExtractPath").focus();
    },
    fillJsonExtractFieldsExample: () => {
      setOutput("jsonExtractInput", JSON.stringify(JSON_EXTRACT_EXAMPLE, null, 2));
      setOutput("jsonExtractBase", "users[*]");
      setOutput("jsonExtractFields", "name, roles");
      $("jsonExtractFields").focus();
    },
    fillJsonExtractRootExample: () => {
      setOutput("jsonExtractInput", JSON.stringify(JSON_EXTRACT_EXAMPLE, null, 2));
      setOutput("jsonExtractBase", "users[*]");
      setOutput("jsonExtractFields", '$["store name"], name');
      $("jsonExtractFields").focus();
    },
    jsonExtractFields: () => {
      const parsed = safeJsonParse($("jsonExtractInput").value);
      const base = $("jsonExtractBase").value.trim();
      const fields = $("jsonExtractFields").value.trim();
      const result = extractJsonProjection(parsed, base, fields);
      setOutput("jsonExtractOutput", JSON.stringify(result, null, 2));
      setText("jsonExtractPathOut", `${base || "$"} → {${fields}}`);
      setText("jsonExtractType", describeExtractedType(result));
      showToast("提取成功");
    },
    jsonExtractUseMain: () => {
      $("jsonExtractInput").value = $("jsonInput").value;
    },
    clearJsonExtract: () => {
      setOutput("jsonExtractInput", "");
      setOutput("jsonExtractPath", "");
      setOutput("jsonExtractOutput", "");
      setText("jsonExtractPathOut", "-");
      setText("jsonExtractType", "-");
    },
  };
  bindActions(actions);

  // JSON 差异对比：结构化视图 / 文本摘要 切换（去掉两处重复输出）
  const diffViewTabs = document.querySelectorAll(".diff-view-tabs .section-tab");
  if (diffViewTabs.length) {
    diffViewTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        diffViewTabs.forEach((t) => t.classList.toggle("active", t === tab));
        const view = tab.dataset.diffView;
        $("jsonDiffViewerWrap").hidden = view !== "viewer";
        $("jsonDiffSummaryWrap").hidden = view !== "summary";
      });
    });
  }
}

