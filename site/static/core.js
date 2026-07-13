// core.js — 共享状态与基础设施：全局 state、$、提示/输出辅助、导航、bindActions、init() 入口。被其余模块依赖，须最先加载。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

const state = {
  parsedImageUrls: [],
  parsedImageItems: [],
  imageCompressPreviews: [],
  compressDebounceTimer: null,
  encodingType: "url",
  imageCompareSettings: {
    columns: 4,
    zoom: 60,
    failedOnly: false,
  },
  fapiaoImageFiles: [],
  fapiaoProgressTimer: null,
  excelImages: [],
  excelProgressTimer: null,
  wordPdfFile: null,
  wordPdfBlob: null,
  wordPdfProgressTimer: null,
  toastTimer: null,
};


function $(id) {
  return document.getElementById(id);
}


function jsonEscapeString(input) {
  return JSON.stringify(input).slice(1, -1);
}


function jsonUnescapeString(input) {
  return JSON.parse('"' + input + '"');
}


function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("toast-error", isError);
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


function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
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


function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error("JSON 格式错误：" + error.message);
  }
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


// —— 第三方库按需加载 ——
// 重型 vendor 库（jspdf / jszip / mammoth / html2canvas / pdfjs）默认不随首屏加载，
// 进入对应面板或点击功能时再动态注入，显著减少首屏阻塞体积（约 1.55 MB）。
const _vendorCache = {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`依赖加载失败: ${src}`));
    document.head.appendChild(script);
  });
}

const _vendorConfigs = {
  jspdf: { src: "vendor/jspdf.umd.min.js", ready: () => typeof window.jspdf !== "undefined" },
  jszip: { src: "vendor/jszip.min.js", ready: () => typeof window.JSZip !== "undefined" },
  mammoth: { src: "vendor/mammoth.browser.min.js", ready: () => typeof window.mammoth !== "undefined" },
  html2canvas: { src: "vendor/html2canvas.min.js", ready: () => typeof window.html2canvas !== "undefined" },
  pdfjs: {
    src: "vendor/pdf.min.js",
    ready: () => typeof window.pdfjsLib !== "undefined",
    after: () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; },
  },
};

async function ensureVendor(name) {
  if (_vendorCache[name]) {
    return _vendorCache[name];
  }
  const cfg = _vendorConfigs[name];
  if (!cfg) {
    throw new Error(`未知依赖: ${name}`);
  }
  const promise = loadScript(cfg.src).then(() => {
    if (!cfg.ready()) {
      throw new Error(`依赖未就绪: ${name}`);
    }
    if (cfg.after) {
      cfg.after();
    }
  });
  _vendorCache[name] = promise;
  return promise;
}


function escapeBashSingleQuotes(value) {
  return String(value).replace(/'/g, `'"'"'`);
}


function buildCurlRequest(method, url, body, contentType = "application/json") {
  if (!body) {
    return `curl -X ${method} "${url}"`;
  }

  const bashSafeBody = escapeBashSingleQuotes(body);

  return [
    `curl -X ${method} "${url}" \\`,
    `  -H "Content-Type: ${contentType}" \\`,
    `  --data-binary '${bashSafeBody}'`,
  ].join("\n");
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
  bindArrayActions();
  bindEsActions();
  bindExcelActions();
  bindWordPdfActions();
}

document.addEventListener("DOMContentLoaded", init);

