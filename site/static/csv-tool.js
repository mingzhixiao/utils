// csv-tool.js — CSV / TSV 格式数据查看、筛选、排序、分页、表头多维过滤与多格式导出工具。
// 遵循经典脚本 + 全局作用域风格，纯函数可在 Node 单元测试中运行。

const CSV_EXAMPLE = [
  'id,姓名,部门,岗位,入职日期,薪资,绩效评分,在职状态,备注',
  '1001,张三,研发部,后端架构师,2021-03-15,32000,4.8,true,"擅长分布式架构，熟悉 Go / Java"',
  '1002,李四,产品部,高级产品经理,2022-07-01,26500,4.5,true,"负责支付与结算中台，经常跨部门协作"',
  '1003,王五,研发部,前端专家,2020-11-20,31000,4.9,true,"主导工具箱体系改造，注重用户体验与性能"',
  '1004,赵六,测试部,测试开发工程师,2023-02-18,21000,4.2,false,"已于上一季度离职，交接完毕"',
  '1005,钱七,运营部,用户增长专家,2022-09-10,23000,4.6,true,"主导社群增长与数据看板构建"',
  '1006,孙八,设计部,UI/UX 主管,2021-05-12,28000,4.7,true,"负责设计规范 Design System 与 Hallmark 主题"',
  '1007,周九,研发部,数据工程师,2023-06-01,24500,4.3,true,"负责离线数仓 ETL 与实时流计算"',
  '1008,吴十,运维部,SRE 工程师,2021-08-25,27000,4.6,true,"维护 K8s 集群与高可用网关"',
  '1009,郑十一,财务部,财务分析师,2022-01-14,19500,4.4,true,"负责成本核算、发票校验与预算报表"',
  '1010,王十二,市场部,品牌策划,2023-10-08,18000,4.1,true,"负责线上新媒体推广与大会赞助"',
  '1011,陈十三,研发部,算法工程师,2022-04-18,35000,4.9,true,"大模型微调、RAG 检索增强架构"',
  '1012,林十四,安全部,安全专家,2020-08-30,33000,4.8,true,"渗透测试、权限合规与防爬策略"',
  '1013,黄十五,研发部,客户端开发,2021-12-05,25000,4.4,false,"合同到期离职"',
  '1014,徐十六,客服部,客户体验主管,2023-03-22,17500,4.5,true,"全渠道客服工单流转优化"',
  '1015,刘十七,研发部,测试工程师,2024-01-15,19000,4.3,true,"自动化回归测试体系建设"',
  '1016,何十八,行政部,行政主管,2019-06-10,16500,4.7,true,"办公环境、固定资产与企业文化活动"',
  '1017,郭十九,研发部,全栈工程师,2023-08-20,29000,4.6,true,"全流程独立交付能力极强"',
  '1018,马二十,研发部,实习生,2024-03-01,7000,4.0,true,"积极肯学，负责基础组件单元测试补充"',
].join('\n');

// 探测文本中最可能使用的分隔符（逗号、制表符、分号、竖线）
function detectDelimiter(text) {
  if (!text) return ',';
  const clean = String(text).replace(/^\uFEFF/, '');
  const lines = clean.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0).slice(0, 15);
  if (!lines.length) return ',';

  const candidates = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    let consistentCount = -1;
    let isConsistent = true;
    let totalCount = 0;

    for (const line of lines) {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (!inQuotes && ch === delim) count++;
      }
      totalCount += count;
      if (consistentCount === -1) {
        consistentCount = count;
      } else if (consistentCount !== count) {
        isConsistent = false;
      }
    }

    if (totalCount > 0) {
      const score = (isConsistent && consistentCount > 0 ? 1000 : 0) + totalCount;
      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = delim;
      }
    }
  }

  return bestDelimiter;
}

// 解析分隔文本（支持 RFC 4180 双引号转义、跨行内容、任意指定分隔符）
function parseDelimitedRows(text, delimiter = ',') {
  const s = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  const len = s.length;
  const dLen = delimiter.length;

  while (i < len) {
    const char = s[i];
    const next = s[i + 1];

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

    if (!inQuotes && (char === '\r' || char === '\n')) {
      row.push(current);
      current = '';
      rows.push(row);
      row = [];
      if (char === '\r' && next === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (!inQuotes && s.substr(i, dLen) === delimiter) {
      row.push(current);
      current = '';
      i += dLen;
      continue;
    }

    current += char;
    i += 1;
  }

  row.push(current);
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c !== undefined && c.trim() !== ''));
}

// 将原始输入转换为规整的表格对象 { headers, rows, rawRows, delimiter }
function parseCsvTable(text, options = {}) {
  const customDelim = options.delimiter && options.delimiter !== 'auto' ? options.delimiter : null;
  const delimiter = customDelim || detectDelimiter(text);
  const hasHeader = options.hasHeader !== false;

  const rawRows = parseDelimitedRows(text, delimiter);
  if (!rawRows.length) {
    return { headers: [], rows: [], rawRows: [], delimiter };
  }

  let maxCols = 0;
  for (const r of rawRows) {
    if (r.length > maxCols) maxCols = r.length;
  }

  let headers = [];
  let dataRows = [];

  if (hasHeader && rawRows.length > 0) {
    headers = rawRows[0].map((h, idx) => {
      const clean = (h || '').trim();
      return clean || `列 ${idx + 1}`;
    });
    while (headers.length < maxCols) {
      headers.push(`列 ${headers.length + 1}`);
    }
    dataRows = rawRows.slice(1);
  } else {
    for (let c = 0; c < maxCols; c++) {
      headers.push(`列 ${c + 1}`);
    }
    dataRows = rawRows;
  }

  const normalizedRows = dataRows.map((r) => {
    const padded = [...r];
    while (padded.length < headers.length) {
      padded.push('');
    }
    return padded;
  });

  return {
    headers,
    rows: normalizedRows,
    rawRows,
    delimiter,
  };
}

// 获取某列所有不重复的取值及频次统计
function getColumnUniqueValues(rows, colIndex) {
  const map = new Map();
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][colIndex] ?? '';
    const val = String(raw).trim();
    map.set(val, (map.get(val) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([val, count]) => ({ val, count }))
    .sort((a, b) => b.count - a.count || a.val.localeCompare(b.val, 'zh-CN'));
}

// 关键词筛选与多维表头复合过滤
function filterCsvData(headers, rows, query, targetColumn = 'all', columnFilters = {}) {
  let result = rows;

  // 1. 全局关键字过滤
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    const colIdx = targetColumn === 'all' ? -1 : parseInt(targetColumn, 10);
    result = result.filter((row) => {
      if (colIdx >= 0 && colIdx < row.length) {
        const val = row[colIdx] == null ? '' : String(row[colIdx]);
        return val.toLowerCase().includes(q);
      }
      return row.some((cell) => {
        const val = cell == null ? '' : String(cell);
        return val.toLowerCase().includes(q);
      });
    });
  }

  // 2. 表头单列筛选 (文本匹配 + 枚举勾选集合)
  const activeFilters = Object.entries(columnFilters || {}).filter(([_, f]) => {
    if (!f) return false;
    const hasQuery = typeof f.query === 'string' && f.query.trim().length > 0;
    const hasSet = f.selectedValues && (typeof f.selectedValues.has === 'function' || Array.isArray(f.selectedValues));
    return hasQuery || hasSet;
  });

  if (!activeFilters.length) {
    return result;
  }

  return result.filter((row) => {
    for (const [colKey, filter] of activeFilters) {
      const colIdx = parseInt(colKey, 10);
      const cellVal = String(row[colIdx] ?? '').trim();

      // 文本包含
      if (filter.query && filter.query.trim()) {
        const sub = filter.query.trim().toLowerCase();
        if (!cellVal.toLowerCase().includes(sub)) {
          return false;
        }
      }

      // 枚举集合过滤
      if (filter.selectedValues) {
        if (typeof filter.selectedValues.has === 'function') {
          if (!filter.selectedValues.has(cellVal)) return false;
        } else if (Array.isArray(filter.selectedValues)) {
          if (!filter.selectedValues.includes(cellVal)) return false;
        }
      }
    }
    return true;
  });
}

// 智能排序：支持数值、日期、通用字符串
function sortCsvData(rows, colIndex, direction = 'asc') {
  if (colIndex < 0 || direction === 'none') {
    return [...rows];
  }

  const isAsc = direction === 'asc';

  return [...rows].sort((a, b) => {
    const valA = a[colIndex] == null ? '' : String(a[colIndex]).trim();
    const valB = b[colIndex] == null ? '' : String(b[colIndex]).trim();

    if (valA === '' && valB === '') return 0;
    if (valA === '') return 1;
    if (valB === '') return -1;

    const numA = Number(valA);
    const numB = Number(valB);
    const isNumA = !Number.isNaN(numA) && /^-?\d+(\.\d+)?$/.test(valA);
    const isNumB = !Number.isNaN(numB) && /^-?\d+(\.\d+)?$/.test(valB);

    if (isNumA && isNumB) {
      return isAsc ? numA - numB : numB - numA;
    }

    const dateRegex = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/;
    if (dateRegex.test(valA) && dateRegex.test(valB)) {
      const timeA = Date.parse(valA);
      const timeB = Date.parse(valB);
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
        return isAsc ? timeA - timeB : timeB - timeA;
      }
    }

    const cmp = valA.localeCompare(valB, 'zh-CN', { numeric: true, sensitivity: 'base' });
    return isAsc ? cmp : -cmp;
  });
}

// 导出为 Markdown 表格
function csvToMarkdownTable(headers, rows) {
  if (!headers.length) return '';
  const escapeMd = (str) => String(str ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const headerLine = `| ${headers.map(escapeMd).join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.map((row) => `| ${headers.map((_, i) => escapeMd(row[i] ?? '')).join(' | ')} |`);
  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

// 导出为 JSON 数组字符串
function csvRowsToJsonString(headers, rows) {
  if (!headers.length) return '[]';
  const list = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i] ?? '';
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val === 'null') val = null;
      else if (/^-?\d+(\.\d+)?$/.test(val) && Number.isFinite(Number(val))) {
        val = Number(val);
      }
      obj[h] = val;
    });
    return obj;
  });
  return JSON.stringify(list, null, 2);
}

// 导出为标准 CSV 字符串
function exportCsvString(headers, rows, delimiter = ',') {
  const escapeCell = (val) => {
    const str = val == null ? '' : String(val);
    if (str.includes('"') || str.includes(delimiter) || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [];
  if (headers && headers.length) {
    lines.push(headers.map(escapeCell).join(delimiter));
  }
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(delimiter));
  }
  return lines.join('\n');
}

// 全局 CSV 状态管理
const csvState = {
  rawText: '',
  fileName: '',
  fileSize: 0,
  headers: [],
  rows: [],
  filteredRows: [],
  displayRows: [],
  sortColumn: -1,
  sortDirection: 'none', // 'asc' | 'desc' | 'none'
  searchQuery: '',
  searchColumn: 'all',
  columnFilters: {}, // { [colIndex]: { query: string, selectedValues: Set<string> | null } }
  enableHeaderFilter: false, // 是否开启表头列过滤功能（默认关闭以优化大表格性能）
  showFilterRow: false, // 是否展开表头快速筛选行
  activeFilterPopoverCol: null, // 当前正在编辑筛选的列索引
  currentPage: 1,
  pageSize: 20,
  hasHeader: true,
  delimiter: 'auto',
  encoding: 'utf-8',
};

// 重新计算筛选、排序与分页视图
function updateCsvComputed() {
  // 1. 复合筛选（全局搜索 + 表头各列过滤）
  csvState.filteredRows = filterCsvData(
    csvState.headers,
    csvState.rows,
    csvState.searchQuery,
    csvState.searchColumn,
    csvState.columnFilters
  );

  // 2. 排序
  csvState.displayRows = sortCsvData(
    csvState.filteredRows,
    csvState.sortColumn,
    csvState.sortDirection
  );

  // 3. 校正分页
  const total = csvState.displayRows.length;
  const maxPage = csvState.pageSize > 0 ? Math.max(1, Math.ceil(total / csvState.pageSize)) : 1;
  if (csvState.currentPage > maxPage) {
    csvState.currentPage = maxPage;
  }
  if (csvState.currentPage < 1) {
    csvState.currentPage = 1;
  }
}

// 检查某列是否有活跃的筛选条件
function isColFilterActive(colIdx) {
  const f = csvState.columnFilters[colIdx];
  if (!f) return false;
  const hasQuery = typeof f.query === 'string' && f.query.trim().length > 0;
  const hasValues = f.selectedValues && f.selectedValues instanceof Set;
  return hasQuery || hasValues;
}

// 渲染统计数据与界面状态
function renderCsvStats() {
  const totalRows = csvState.rows.length;
  const filteredCount = csvState.filteredRows.length;
  const colCount = csvState.headers.length;

  setText('csvTotalRowCount', totalRows);
  setText('csvColCount', colCount);
  setText('csvFilteredCount', filteredCount);

  // 检查是否有任何筛选生效（全局搜索或任意列筛选）
  const hasActiveColFilters = Object.keys(csvState.columnFilters).some(isColFilterActive);
  const isFiltered = !!csvState.searchQuery || hasActiveColFilters;

  const filterIndicator = $('csvFilteredStatItem');
  if (filterIndicator) {
    filterIndicator.style.display = isFiltered ? '' : 'none';
  }

  const badge = $('csvFileBadge');
  if (badge) {
    if (csvState.fileName) {
      badge.textContent = `${csvState.fileName} (${formatBytes(csvState.fileSize || csvState.rawText.length)})`;
    } else if (totalRows > 0) {
      badge.textContent = `文本输入 · ${totalRows} 行`;
    } else {
      badge.textContent = '未载入数据';
    }
  }

  // 填充列筛选下拉框
  const colSelect = $('csvSearchColumn');
  if (colSelect && colSelect.dataset.renderedCols !== String(colCount)) {
    const currentVal = colSelect.value;
    colSelect.innerHTML = '<option value="all">全部列</option>';
    csvState.headers.forEach((h, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${idx + 1}. ${h}`;
      colSelect.appendChild(opt);
    });
    colSelect.dataset.renderedCols = String(colCount);
    if (currentVal && Array.from(colSelect.options).some((o) => o.value === currentVal)) {
      colSelect.value = currentVal;
    }
  }

  // 渲染活跃筛选标签条
  renderActiveFilterTags();

  // 导出与操作按钮禁用状态
  const hasData = totalRows > 0;
  ['csvExportCsvBtn', 'csvCopyMdBtn', 'csvCopyJsonBtn', 'csvClearBtn', 'csvToggleHeaderFilterBtn'].forEach((id) => {
    const btn = $(id);
    if (btn) btn.disabled = !hasData;
  });

  const toggleHeaderBtn = $('csvToggleHeaderFilterBtn');
  if (toggleHeaderBtn) {
    toggleHeaderBtn.classList.toggle('active', csvState.enableHeaderFilter);
    toggleHeaderBtn.textContent = csvState.enableHeaderFilter ? '关闭表头过滤' : '开启表头过滤';
  }
}

// 渲染已生效的表头筛选标签栏
function renderActiveFilterTags() {
  const container = $('csvActiveFiltersBar');
  if (!container) return;

  const activeEntries = Object.entries(csvState.columnFilters).filter(([colIdx]) => isColFilterActive(colIdx));

  if (!activeEntries.length && !csvState.searchQuery) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  let html = '<div class="active-filters-label">筛选条件：</div><div class="active-filters-list">';

  if (csvState.searchQuery) {
    html += `
      <span class="active-filter-tag">
        <span class="tag-title">全局搜索:</span>
        <span class="tag-val">${escapeHtml(csvState.searchQuery)}</span>
        <button class="tag-remove-btn" type="button" data-clear-global="true" title="清除全局搜索">✕</button>
      </span>
    `;
  }

  activeEntries.forEach(([colStr, f]) => {
    const colIdx = parseInt(colStr, 10);
    const headerName = csvState.headers[colIdx] || `列 ${colIdx + 1}`;
    let desc = '';

    if (f.query && f.query.trim()) {
      desc = `包含 "${f.query}"`;
    }
    if (f.selectedValues && f.selectedValues instanceof Set) {
      const count = f.selectedValues.size;
      const totalUniq = getColumnUniqueValues(csvState.rows, colIdx).length;
      desc += (desc ? ' 且 ' : '') + `已选 ${count}/${totalUniq} 项`;
    }

    html += `
      <span class="active-filter-tag">
        <span class="tag-title">${escapeHtml(headerName)}:</span>
        <span class="tag-val">${escapeHtml(desc)}</span>
        <button class="tag-remove-btn" type="button" data-clear-col="${colIdx}" title="清除本列筛选">✕</button>
      </span>
    `;
  });

  html += '</div>';
  html += '<button class="clear-all-filters-btn" type="button" data-action="clearAllCsvFilters">清空全部筛选</button>';

  container.innerHTML = html;

  // 绑定标签移除事件
  container.querySelectorAll('[data-clear-col]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const colIdx = parseInt(btn.dataset.clearCol, 10);
      delete csvState.columnFilters[colIdx];
      updateCsvComputed();
      renderCsvStats();
      renderCsvTable();
      showToast('已清除该列筛选');
    });
  });

  container.querySelector('[data-clear-global]')?.addEventListener('click', () => {
    csvState.searchQuery = '';
    if ($('csvSearchInput')) $('csvSearchInput').value = '';
    updateCsvComputed();
    renderCsvStats();
    renderCsvTable();
    showToast('已清除全局搜索');
  });

  container.querySelector('[data-action="clearAllCsvFilters"]')?.addEventListener('click', () => {
    csvState.columnFilters = {};
    csvState.searchQuery = '';
    if ($('csvSearchInput')) $('csvSearchInput').value = '';
    updateCsvComputed();
    renderCsvStats();
    renderCsvTable();
    showToast('已清空全部筛选条件');
  });
}

// 渲染表格主体（包含表头筛选按钮与可选快捷筛选行）
function renderCsvTable() {
  const container = $('csvTableContainer');
  if (!container) return;

  if (!csvState.headers.length && !csvState.rows.length) {
    container.innerHTML = `
      <div class="csv-empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>
        </svg>
        <p class="empty-title">暂无数据</p>
        <p class="empty-subtitle">支持在上方直接粘贴 CSV / TSV 文本，或拖拽上传 .csv、.tsv、.txt 文件</p>
        <button class="secondary" data-action="fillCsvExample" type="button" style="margin-top: 8px;">载入示例数据体验</button>
      </div>
    `;
    const fillBtn = container.querySelector('[data-action="fillCsvExample"]');
    if (fillBtn) {
      fillBtn.addEventListener('click', () => {
        setOutput('csvInput', CSV_EXAMPLE);
        csvState.fileName = '';
        csvState.fileSize = 0;
        loadCsvFromInput();
      });
    }
    renderCsvPagination();
    return;
  }

  const query = csvState.searchQuery.trim().toLowerCase();

  // 分页截取
  const total = csvState.displayRows.length;
  let pageRows = csvState.displayRows;
  let startIndex = 0;

  if (csvState.pageSize > 0) {
    startIndex = (csvState.currentPage - 1) * csvState.pageSize;
    pageRows = csvState.displayRows.slice(startIndex, startIndex + csvState.pageSize);
  }

  let tableHtml = '<table class="csv-data-table" id="csvDataTable">';

  // 1. 表头
  tableHtml += '<thead><tr>';
  tableHtml += '<th class="csv-th-index" title="行号">#</th>';
  csvState.headers.forEach((header, colIdx) => {
    let sortClass = 'sortable';
    let sortIcon = '↕';
    if (csvState.sortColumn === colIdx) {
      if (csvState.sortDirection === 'asc') {
        sortClass += ' sort-asc';
        sortIcon = '▲';
      } else if (csvState.sortDirection === 'desc') {
        sortClass += ' sort-desc';
        sortIcon = '▼';
      }
    }

    if (csvState.enableHeaderFilter) {
      const hasFilter = isColFilterActive(colIdx);
      const filterBtnClass = `th-filter-btn${hasFilter ? ' active' : ''}`;
      const filterTitle = hasFilter ? '此列已设置筛选条件（点击修改）' : '点击筛选此列';

      tableHtml += `
        <th class="${sortClass}${hasFilter ? ' has-filter' : ''}" data-col-index="${colIdx}">
          <div class="th-content">
            <span class="th-text" title="点击依此列排序">${escapeHtml(header)}</span>
            <span class="sort-icon" title="排序">${sortIcon}</span>
            <button class="${filterBtnClass}" type="button" data-filter-col="${colIdx}" title="${filterTitle}" aria-label="筛选此列">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              ${hasFilter ? '<span class="filter-dot"></span>' : ''}
            </button>
          </div>
        </th>
      `;
    } else {
      tableHtml += `
        <th class="${sortClass}" data-col-index="${colIdx}">
          <div class="th-content">
            <span class="th-text" title="点击依此列排序">${escapeHtml(header)}</span>
            <span class="sort-icon" title="排序">${sortIcon}</span>
          </div>
        </th>
      `;
    }
  });
  tableHtml += '<th class="csv-th-action">操作</th>';
  tableHtml += '</tr>';

  // 1.1 可选展开的快捷表头筛选输入行（仅在开启表头过滤后生效）
  if (csvState.enableHeaderFilter && csvState.showFilterRow) {
    tableHtml += '<tr class="csv-filter-row">';
    tableHtml += '<th class="csv-th-index-filter"></th>';
    csvState.headers.forEach((_, colIdx) => {
      const currentQuery = csvState.columnFilters[colIdx]?.query || '';
      tableHtml += `
        <th>
          <input type="text" class="col-filter-input" data-filter-col-input="${colIdx}" value="${escapeHtml(currentQuery)}" placeholder="过滤..." />
        </th>
      `;
    });
    tableHtml += '<th></th></tr>';
  }

  tableHtml += '</thead>';

  // 2. 表体
  tableHtml += '<tbody>';
  if (!pageRows.length) {
    tableHtml += `<tr><td colspan="${csvState.headers.length + 2}" class="csv-no-match">未找到与当前筛选条件匹配的行</td></tr>`;
  } else {
    pageRows.forEach((row, rowOffset) => {
      const originalRowIndex = startIndex + rowOffset;
      tableHtml += `<tr data-row-idx="${originalRowIndex}">`;
      tableHtml += `<td class="csv-td-index">${originalRowIndex + 1}</td>`;

      csvState.headers.forEach((_, colIdx) => {
        const rawCell = row[colIdx] ?? '';
        const cellStr = String(rawCell);
        let displayHtml = '';

        if (cellStr === '') {
          displayHtml = '<span class="csv-empty-cell">(空)</span>';
        } else if (query && (csvState.searchColumn === 'all' || parseInt(csvState.searchColumn, 10) === colIdx)) {
          displayHtml = highlightCsvMatch(cellStr, query);
        } else {
          displayHtml = escapeHtml(cellStr);
        }

        const isNumeric = /^-?\d+(\.\d+)?$/.test(cellStr.trim());
        const alignClass = isNumeric ? ' text-right' : '';

        tableHtml += `<td class="csv-td-cell${alignClass}" title="${escapeHtml(cellStr)}">${displayHtml}</td>`;
      });

      tableHtml += `
        <td class="csv-td-action">
          <button class="csv-detail-btn" type="button" data-detail-idx="${originalRowIndex}" title="查看本行完整明细">
            明细
          </button>
        </td>
      `;
      tableHtml += '</tr>';
    });
  }
  tableHtml += '</tbody></table>';

  container.innerHTML = tableHtml;

  // 绑定表头点击排序（排除点击筛选按钮）
  container.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', (e) => {
      if (e.target.closest('.th-filter-btn')) return;
      const colIdx = parseInt(th.dataset.colIndex, 10);
      if (csvState.sortColumn === colIdx) {
        if (csvState.sortDirection === 'asc') csvState.sortDirection = 'desc';
        else if (csvState.sortDirection === 'desc') {
          csvState.sortDirection = 'none';
          csvState.sortColumn = -1;
        } else csvState.sortDirection = 'asc';
      } else {
        csvState.sortColumn = colIdx;
        csvState.sortDirection = 'asc';
      }
      updateCsvComputed();
      renderCsvStats();
      renderCsvTable();
    });
  });

  // 绑定表头漏斗筛选弹窗打开与快捷输入（仅在开启表头过滤时有效）
  if (csvState.enableHeaderFilter) {
    container.querySelectorAll('.th-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const colIdx = parseInt(btn.dataset.filterCol, 10);
        openColumnFilterPopover(colIdx, btn);
      });
    });

    if (csvState.showFilterRow) {
      container.querySelectorAll('.col-filter-input').forEach((input) => {
        const colIdx = parseInt(input.dataset.filterColInput, 10);
        input.addEventListener('input', (e) => {
          if (!csvState.columnFilters[colIdx]) {
            csvState.columnFilters[colIdx] = { query: '', selectedValues: null };
          }
          csvState.columnFilters[colIdx].query = e.target.value;
          csvState.currentPage = 1;
          updateCsvComputed();
          renderCsvStats();
          // 维持 input 焦点
          const activeId = colIdx;
          renderCsvTable();
          const nextInput = container.querySelector(`[data-filter-col-input="${activeId}"]`);
          if (nextInput) {
            nextInput.focus();
            nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
          }
        });
      });
    }
  }

  // 绑定行单击高亮与双击详情
  container.querySelectorAll('tbody tr[data-row-idx]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.csv-detail-btn')) return;
      container.querySelectorAll('tr.selected').forEach((r) => r.classList.remove('selected'));
      tr.classList.add('selected');
    });
    tr.addEventListener('dblclick', () => {
      const idx = parseInt(tr.dataset.rowIdx, 10);
      openCsvRowDetail(idx);
    });
  });

  // 绑定明细按钮
  container.querySelectorAll('.csv-detail-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.detailIdx, 10);
      openCsvRowDetail(idx);
    });
  });

  renderCsvPagination();
}

// 关键词高亮辅助
function highlightCsvMatch(text, query) {
  if (!query) return escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts
    .map((part) => {
      if (part.toLowerCase() === query) {
        return `<mark class="csv-highlight">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    })
    .join('');
}

// 打开表头单列筛选浮层 (Column Filter Popover)
function openColumnFilterPopover(colIdx, anchorBtn) {
  csvState.activeFilterPopoverCol = colIdx;
  const headerName = csvState.headers[colIdx] || `列 ${colIdx + 1}`;
  const uniqueItems = getColumnUniqueValues(csvState.rows, colIdx);

  let popover = $('csvColFilterPopover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'csvColFilterPopover';
    popover.className = 'csv-col-filter-popover';
    document.body.appendChild(popover);
  }

  const currentFilter = csvState.columnFilters[colIdx] || { query: '', selectedValues: null };
  const currentQuery = currentFilter.query || '';
  const isSubset = currentFilter.selectedValues instanceof Set;

  let valuesHtml = '';
  uniqueItems.forEach(({ val, count }, itemIdx) => {
    const isChecked = isSubset ? currentFilter.selectedValues.has(val) : true;
    const displayVal = val === '' ? '(空值)' : val;
    valuesHtml += `
      <label class="popover-val-item" data-val-idx="${itemIdx}" data-val-text="${escapeHtml(val.toLowerCase())}">
        <input type="checkbox" class="popover-val-checkbox" value="${escapeHtml(val)}" ${isChecked ? 'checked' : ''} />
        <span class="val-label${val === '' ? ' val-empty' : ''}">${escapeHtml(displayVal)}</span>
        <span class="val-count">${count}</span>
      </label>
    `;
  });

  popover.innerHTML = `
    <div class="popover-arrow"></div>
    <div class="popover-header">
      <span class="popover-title">筛选: <strong>${escapeHtml(headerName)}</strong></span>
      <button type="button" class="popover-close-btn" id="popoverCloseBtn" aria-label="关闭">✕</button>
    </div>
    <div class="popover-body">
      <div class="popover-search-wrap">
        <input type="text" id="popoverSearchInput" class="popover-search-input" value="${escapeHtml(currentQuery)}" placeholder="搜索此列内容..." />
      </div>
      <div class="popover-actions-bar">
        <button type="button" class="popover-link-btn" id="popoverSelectAll">全选</button>
        <span class="popover-split">|</span>
        <button type="button" class="popover-link-btn" id="popoverSelectNone">全不选</button>
        <span class="popover-items-summary">共 ${uniqueItems.length} 项</span>
      </div>
      <div class="popover-values-list" id="popoverValuesList">
        ${valuesHtml}
      </div>
    </div>
    <div class="popover-footer">
      <button type="button" class="secondary" id="popoverClearColBtn">清除本列</button>
      <button type="button" class="accent-green" id="popoverApplyBtn">确定筛选</button>
    </div>
  `;

  // 计算定位
  const rect = anchorBtn.getBoundingClientRect();
  const popoverWidth = 260;
  let left = rect.left + window.scrollX - 40;
  let top = rect.bottom + window.scrollY + 6;

  // 视口边界保护
  if (left + popoverWidth > window.innerWidth - 12) {
    left = window.innerWidth - popoverWidth - 12;
  }
  if (left < 12) left = 12;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.classList.add('open');

  // 本地过滤枚举列表
  const valSearch = $('popoverSearchInput');
  const valuesContainer = $('popoverValuesList');

  const filterVisibleValues = (sub) => {
    const q = (sub || '').trim().toLowerCase();
    valuesContainer.querySelectorAll('.popover-val-item').forEach((item) => {
      const text = item.dataset.valText || '';
      item.style.display = !q || text.includes(q) ? '' : 'none';
    });
  };

  valSearch?.addEventListener('input', (e) => {
    filterVisibleValues(e.target.value);
  });

  // 全选 / 全不选
  $('popoverSelectAll')?.addEventListener('click', () => {
    valuesContainer.querySelectorAll('.popover-val-checkbox').forEach((cb) => {
      const parent = cb.closest('.popover-val-item');
      if (parent && parent.style.display !== 'none') {
        cb.checked = true;
      }
    });
  });

  $('popoverSelectNone')?.addEventListener('click', () => {
    valuesContainer.querySelectorAll('.popover-val-checkbox').forEach((cb) => {
      const parent = cb.closest('.popover-val-item');
      if (parent && parent.style.display !== 'none') {
        cb.checked = false;
      }
    });
  });

  // 关闭
  $('popoverCloseBtn')?.addEventListener('click', closeColumnFilterPopover);

  // 清除本列
  $('popoverClearColBtn')?.addEventListener('click', () => {
    delete csvState.columnFilters[colIdx];
    closeColumnFilterPopover();
    updateCsvComputed();
    renderCsvStats();
    renderCsvTable();
    showToast(`已清除 ${headerName} 筛选`);
  });

  // 确定应用
  $('popoverApplyBtn')?.addEventListener('click', () => {
    const checkedValues = new Set();
    const allCheckboxes = valuesContainer.querySelectorAll('.popover-val-checkbox');
    let allChecked = true;

    allCheckboxes.forEach((cb) => {
      if (cb.checked) {
        checkedValues.add(cb.value);
      } else {
        allChecked = false;
      }
    });

    const subQuery = valSearch?.value?.trim() || '';

    // 如果全选且没有查询条件，则清除该列过滤
    if (allChecked && !subQuery) {
      delete csvState.columnFilters[colIdx];
    } else {
      csvState.columnFilters[colIdx] = {
        query: subQuery,
        selectedValues: allChecked ? null : checkedValues,
      };
    }

    closeColumnFilterPopover();
    csvState.currentPage = 1;
    updateCsvComputed();
    renderCsvStats();
    renderCsvTable();
    showToast(`已应用 ${headerName} 筛选`);
  });

  // 点击空白区域自动关闭
  const handleOutsideClick = (e) => {
    if (!popover.contains(e.target) && !anchorBtn.contains(e.target)) {
      closeColumnFilterPopover();
      document.removeEventListener('click', handleOutsideClick);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 10);
}

function closeColumnFilterPopover() {
  const popover = $('csvColFilterPopover');
  if (popover) {
    popover.classList.remove('open');
  }
  csvState.activeFilterPopoverCol = null;
}

// 渲染分页器
function renderCsvPagination() {
  const paginationBar = $('csvPaginationBar');
  if (!paginationBar) return;

  const total = csvState.displayRows.length;
  if (total === 0 || csvState.pageSize === 0) {
    paginationBar.style.display = total > 0 ? '' : 'none';
    const infoSpan = $('csvPageInfo');
    if (infoSpan) {
      infoSpan.textContent = total > 0 ? `全部展示，共 ${total} 条` : '';
    }
    const prevBtn = $('csvPrevPageBtn');
    const nextBtn = $('csvNextPageBtn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  paginationBar.style.display = '';
  const maxPage = Math.max(1, Math.ceil(total / csvState.pageSize));
  const current = csvState.currentPage;

  const start = (current - 1) * csvState.pageSize + 1;
  const end = Math.min(current * csvState.pageSize, total);

  setText('csvPageInfo', `第 ${start} - ${end} 条，共 ${total} 条 (第 ${current} / ${maxPage} 页)`);

  const prevBtn = $('csvPrevPageBtn');
  const nextBtn = $('csvNextPageBtn');
  if (prevBtn) prevBtn.disabled = current <= 1;
  if (nextBtn) nextBtn.disabled = current >= maxPage;
}

// 打开单行详情抽屉/模态框
function openCsvRowDetail(rowIndex) {
  const row = csvState.displayRows[rowIndex];
  if (!row) return;

  const modal = $('csvDetailModal');
  const content = $('csvDetailContent');
  const title = $('csvDetailTitle');
  if (!modal || !content) return;

  if (title) {
    title.textContent = `第 ${rowIndex + 1} 行完整明细`;
  }

  let html = '<div class="csv-detail-grid">';
  csvState.headers.forEach((header, idx) => {
    const val = row[idx] ?? '';
    html += `
      <div class="csv-detail-item">
        <div class="detail-label">
          <span>${escapeHtml(header)}</span>
          <button class="detail-copy-cell" data-copy-val="${escapeHtml(val)}" title="复制此字段值">复制</button>
        </div>
        <div class="detail-value">${val ? escapeHtml(val) : '<span class="csv-empty-cell">(空)</span>'}</div>
      </div>
    `;
  });
  html += '</div>';

  content.innerHTML = html;

  content.querySelectorAll('.detail-copy-cell').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.copyVal || '';
      try {
        await copyText(val);
        showToast('已复制字段内容');
      } catch (err) {
        showToast(`复制失败: ${err.message}`, true);
      }
    });
  });

  const rowObj = {};
  csvState.headers.forEach((h, idx) => {
    rowObj[h] = row[idx] ?? '';
  });
  const copyRowJsonBtn = $('csvCopyRowJsonBtn');
  if (copyRowJsonBtn) {
    copyRowJsonBtn.onclick = async () => {
      try {
        await copyText(JSON.stringify(rowObj, null, 2));
        showToast('已复制单行 JSON');
      } catch (err) {
        showToast(`复制失败: ${err.message}`, true);
      }
    };
  }

  modal.classList.add('open');
}

function closeCsvRowDetail() {
  const modal = $('csvDetailModal');
  if (modal) modal.classList.remove('open');
}

// 从当前输入框/文件文本加载并解析 CSV
function loadCsvFromInput() {
  const text = $('csvInput')?.value || '';
  csvState.rawText = text;

  if (!text.trim()) {
    csvState.headers = [];
    csvState.rows = [];
    csvState.filteredRows = [];
    csvState.displayRows = [];
    csvState.sortColumn = -1;
    csvState.sortDirection = 'none';
    csvState.columnFilters = {};
    csvState.currentPage = 1;
    updateCsvComputed();
    renderCsvStats();
    renderCsvTable();
    return;
  }

  const delimSelect = $('csvDelimiterSelect');
  const headerCheck = $('csvHasHeaderCheck');

  csvState.delimiter = delimSelect ? delimSelect.value : 'auto';
  csvState.hasHeader = headerCheck ? headerCheck.checked : true;

  const parsed = parseCsvTable(text, {
    delimiter: csvState.delimiter,
    hasHeader: csvState.hasHeader,
  });

  csvState.headers = parsed.headers;
  csvState.rows = parsed.rows;
  csvState.currentPage = 1;
  csvState.sortColumn = -1;
  csvState.sortDirection = 'none';
  csvState.columnFilters = {};
  csvState.enableHeaderFilter = false;

  const detectedBadge = $('csvDetectedDelimBadge');
  if (detectedBadge) {
    const delimNames = { ',': '逗号 (,)', '\t': '制表符 (Tab)', ';': '分号 (;)', '|': '竖线 (|)' };
    detectedBadge.textContent = delimNames[parsed.delimiter] || `自定义 (${parsed.delimiter})`;
  }

  updateCsvComputed();
  renderCsvStats();
  renderCsvTable();
  showToast(`已成功载入 ${csvState.rows.length} 行数据`);
}

// 读取 File 文件（支持 GBK / UTF-8）
async function readCsvFile(file, encoding = 'utf-8') {
  if (!file) return;
  csvState.fileName = file.name;
  csvState.fileSize = file.size;

  const buffer = await file.arrayBuffer();
  let text = '';
  try {
    const decoder = new TextDecoder(encoding);
    text = decoder.decode(buffer);
  } catch (err) {
    const decoder = new TextDecoder('utf-8');
    text = decoder.decode(buffer);
  }

  setOutput('csvInput', text);
  loadCsvFromInput();
}

// 绑定所有的事件与交互
function bindCsvActions() {
  const input = $('csvInput');
  const dropZone = $('csvDropZone');
  const fileInput = $('csvFileInput');

  // 1. 拖拽支持
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('active');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('active');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('active');
      if (e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        const enc = $('csvEncodingSelect')?.value || 'utf-8';
        readCsvFile(file, enc);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        const file = e.target.files[0];
        const enc = $('csvEncodingSelect')?.value || 'utf-8';
        readCsvFile(file, enc);
        e.target.value = '';
      }
    });
  }

  // 2. 编码切换事件
  $('csvEncodingSelect')?.addEventListener('change', (e) => {
    csvState.encoding = e.target.value;
    if (fileInput?.files?.length) {
      readCsvFile(fileInput.files[0], csvState.encoding);
    } else {
      showToast(`当前编码已设为 ${csvState.encoding.toUpperCase()}`);
    }
  });

  // 3. 分隔符和表头切换
  $('csvDelimiterSelect')?.addEventListener('change', () => {
    if ($('csvInput')?.value?.trim()) loadCsvFromInput();
  });
  $('csvHasHeaderCheck')?.addEventListener('change', () => {
    if ($('csvInput')?.value?.trim()) loadCsvFromInput();
  });

  // 4. 输入框输入防抖
  if (input) {
    let inputDebounceTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => {
        loadCsvFromInput();
      }, 300);
    });
  }

  // 5. 搜索过滤
  const searchInput = $('csvSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      csvState.searchQuery = e.target.value;
      csvState.currentPage = 1;
      updateCsvComputed();
      renderCsvStats();
      renderCsvTable();
    });
  }
  $('csvSearchColumn')?.addEventListener('change', (e) => {
    csvState.searchColumn = e.target.value;
    csvState.currentPage = 1;
    updateCsvComputed();
    renderCsvStats();
    renderCsvTable();
  });

  // 6. 每页条数
  $('csvPageSizeSelect')?.addEventListener('change', (e) => {
    csvState.pageSize = parseInt(e.target.value, 10);
    csvState.currentPage = 1;
    updateCsvComputed();
    renderCsvTable();
  });

  // 7. 分页翻页按钮
  $('csvPrevPageBtn')?.addEventListener('click', () => {
    if (csvState.currentPage > 1) {
      csvState.currentPage -= 1;
      renderCsvTable();
    }
  });
  $('csvNextPageBtn')?.addEventListener('click', () => {
    const total = csvState.displayRows.length;
    const maxPage = csvState.pageSize > 0 ? Math.ceil(total / csvState.pageSize) : 1;
    if (csvState.currentPage < maxPage) {
      csvState.currentPage += 1;
      renderCsvTable();
    }
  });

  // 8. 详情弹窗关闭
  $('csvDetailCloseBtn')?.addEventListener('click', closeCsvRowDetail);
  $('csvDetailModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'csvDetailModal') {
      closeCsvRowDetail();
    }
  });

  // 9. 动作按钮映射
  const actions = {
    loadCsvTable: () => loadCsvFromInput(),
    fillCsvExample: () => {
      setOutput('csvInput', CSV_EXAMPLE);
      csvState.fileName = '';
      csvState.fileSize = 0;
      loadCsvFromInput();
      $('csvInput')?.focus();
    },
    clearCsvData: () => {
      setOutput('csvInput', '');
      csvState.rawText = '';
      csvState.fileName = '';
      csvState.fileSize = 0;
      csvState.headers = [];
      csvState.rows = [];
      csvState.filteredRows = [];
      csvState.displayRows = [];
      csvState.columnFilters = {};
      csvState.enableHeaderFilter = false;
      csvState.searchQuery = '';
      if ($('csvSearchInput')) $('csvSearchInput').value = '';
      updateCsvComputed();
      renderCsvStats();
      renderCsvTable();
      showToast('已清空');
    },
    toggleHeaderFilter: () => {
      csvState.enableHeaderFilter = !csvState.enableHeaderFilter;
      const toggleBtn = $('csvToggleHeaderFilterBtn');
      if (toggleBtn) {
        toggleBtn.classList.toggle('active', csvState.enableHeaderFilter);
        toggleBtn.textContent = csvState.enableHeaderFilter ? '关闭表头过滤' : '开启表头过滤';
      }
      if (!csvState.enableHeaderFilter) {
        closeColumnFilterPopover();
        // 关闭时清除列过滤条件，恢复所有行并释放性能
        if (Object.keys(csvState.columnFilters).length > 0) {
          csvState.columnFilters = {};
          updateCsvComputed();
          renderCsvStats();
        }
        showToast('已关闭表头过滤，性能已优化');
      } else {
        showToast('已开启表头过滤，可点击各列漏斗进行多维筛选');
      }
      renderCsvTable();
    },
    toggleCsvConfigCollapse: () => {
      const card = document.querySelector('.csv-config-card');
      if (!card) return;
      const isCollapsed = card.classList.toggle('collapsed');
      const btn = $('csvToggleConfigBtn');
      if (btn) {
        btn.textContent = isCollapsed ? '展开配置' : '折叠配置';
      }
      showToast(isCollapsed ? '已折叠配置面板' : '已展开配置面板');
    },
    exportFilteredCsv: () => {
      if (!csvState.displayRows.length) {
        throw new Error('没有可导出的数据');
      }
      const delim = csvState.delimiter !== 'auto' ? csvState.delimiter : ',';
      const csvStr = exportCsvString(csvState.headers, csvState.displayRows, delim);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const fileName = `export_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast(`已导出 ${csvState.displayRows.length} 行数据`);
    },
    copyCsvAsMarkdown: async () => {
      if (!csvState.displayRows.length) {
        throw new Error('没有可复制的数据');
      }
      const md = csvToMarkdownTable(csvState.headers, csvState.displayRows);
      await copyText(md);
      showToast(`已将 ${csvState.displayRows.length} 行数据复制为 Markdown 表格`);
    },
    copyCsvAsJson: async () => {
      if (!csvState.displayRows.length) {
        throw new Error('没有可复制的数据');
      }
      const json = csvRowsToJsonString(csvState.headers, csvState.displayRows);
      await copyText(json);
      showToast(`已将 ${csvState.displayRows.length} 行数据复制为 JSON 数组`);
    },
    sendCsvToJsonTool: () => {
      if (!csvState.displayRows.length) {
        throw new Error('没有可发送的数据');
      }
      const json = csvRowsToJsonString(csvState.headers, csvState.displayRows);
      $('jsonInput').value = json;
      activatePanel('jsonSection');
      const mainTab = document.querySelector('[data-subtab-target="jsonTransformPane"]');
      if (mainTab) activateSubtab(mainTab);
      showToast('已发送到 JSON 工具');
    },
    jsonTsvSendToCsv: () => {
      const output = $('tsvInput')?.value?.trim();
      if (!output) {
        throw new Error('制表符输入框中无数据');
      }
      if ($('csvInput')) $('csvInput').value = output;
      if ($('csvDelimiterSelect')) $('csvDelimiterSelect').value = '\t';
      activatePanel('csvSection');
      loadCsvFromInput();
      showToast('已载入 CSV 查看器');
    },
  };

  bindActions(actions);

  // 初始化表格与统计状态（首次打开展示空状态提示）
  renderCsvStats();
  renderCsvTable();
}

if (typeof window !== "undefined") {
  window.csvState = csvState;
  window.getColumnUniqueValues = getColumnUniqueValues;
  window.filterCsvData = filterCsvData;
  window.sortCsvData = sortCsvData;
  window.parseCsvTable = parseCsvTable;
  window.csvToMarkdownTable = csvToMarkdownTable;
  window.csvRowsToJsonString = csvRowsToJsonString;
  window.detectDelimiter = detectDelimiter;
}
