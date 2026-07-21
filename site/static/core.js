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
  pdfImageFile: null,
  pdfImages: [],
  pdfImageProgressTimer: null,
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
  const targetId = button.dataset.subtabTarget;
  if (!targetId) {
    return;
  }
  const tabs = button.closest(".section-tabs");
  const panel = button.closest(".tool-panel");
  if (!tabs || !panel) {
    return;
  }
  tabs.querySelectorAll(".section-tab").forEach((tab) => {
    tab.classList.toggle("active", tab === button);
  });
  panel.querySelectorAll(".subpanel").forEach((subpanel) => {
    subpanel.classList.toggle("active", subpanel.id === targetId);
  });
}


function bindSubtabs() {
  document.querySelectorAll(".section-tabs:not(.diff-view-tabs)").forEach((tabs) => {
    tabs.querySelectorAll(".section-tab").forEach((button) => {
      button.addEventListener("click", () => activateSubtab(button));
    });
    const initialButton = tabs.querySelector(".section-tab.active") || tabs.querySelector(".section-tab");
    if (initialButton) {
      activateSubtab(initialButton);
    }
  });
}


function bindMobileSidebar() {
  const rail = document.querySelector(".side-rail");
  const toggle = $("menuToggleBtn");
  const closeBtn = $("sidebarCloseBtn");
  const overlay = $("sidebarOverlay");
  if (!rail || !toggle) {
    return;
  }

  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;
  const railWidth = () => rail.offsetWidth || 280;
  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EDGE = 24; // 屏幕左缘热区，用于从边缘拖出抽屉

  let isOpen = false;
  let railX = -railWidth(); // 当前位移：0 = 完全展开，-railWidth = 收起
  let dragging = false;
  let pending = false;
  let dragContext = "";
  let startX = 0;
  let startOffset = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // px / 帧
  let rafId = 0;

  const setX = (value) => {
    railX = value;
    rail.style.transform = `translateX(${value}px)`;
  };

  const applyState = (open) => {
    isOpen = open;
    rail.classList.toggle("open", open);
    if (overlay) overlay.classList.toggle("show", open);
    document.body.style.overflow = open ? "hidden" : "";
  };

  // 弹簧动画：从当前呈现值出发、继承速度、随时可被打断 (Apple Design §3/§4)
  const springTo = (target, fromVel = 0) => {
    cancelAnimationFrame(rafId);
    if (prefersReducedMotion()) {
      setX(target);
      return;
    }
    let x = railX;
    let v = fromVel;
    const stiffness = 0.16;
    const damping = 0.76;
    const tick = () => {
      const force = (target - x) * stiffness;
      v = (v + force) * damping;
      x += v;
      if (Math.abs(target - x) < 0.4 && Math.abs(v) < 0.4) {
        setX(target);
        return;
      }
      setX(x);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };

  const open = () => {
    applyState(true);
    springTo(0);
  };
  const close = () => {
    applyState(false);
    springTo(-railWidth());
  };

  const beginDrag = (clientX, pointerId) => {
    cancelAnimationFrame(rafId);
    dragging = true;
    pending = true;
    startX = clientX;
    startOffset = railX;
    lastX = clientX;
    lastT = performance.now();
    velocity = 0;
    rail.style.transition = "none";
    document.body.classList.add("is-dragging");
    try {
      rail.setPointerCapture(pointerId);
    } catch (_) {
      // 边缘热区按下时指针未必在 rail 上，capture 可能失败，靠 window 监听兜底
    }
  };

  const moveDrag = (clientX) => {
    if (!dragging) return;
    let next = startOffset + (clientX - startX);
    const w = railWidth();
    if (next > 0) {
      next = next * 0.3; // 越过展开边界的橡皮筋
    } else if (next < -w) {
      next = -w + (next + w) * 0.3; // 越过收起边界的橡皮筋
    }
    const now = performance.now();
    const dt = now - lastT || 16;
    velocity = ((clientX - lastX) / dt) * 16;
    lastX = clientX;
    lastT = now;
    setX(next);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("is-dragging");
    if (!pending) return;
    pending = false;
    // 轻点未移动：遮罩关闭，其余保持原状
    if (Math.abs(railX - startOffset) < 6 && Math.abs(velocity) < 1) {
      if (dragContext === "overlay") close();
      return;
    }
    const w = railWidth();
    const past = w * 0.4;
    const flickOpen = velocity > 3.5;
    const flickClose = velocity < -3.5;
    if (startOffset < 0) {
      // 起始为收起状态
      if (railX > past || flickOpen) open();
      else close();
    } else {
      // 起始为展开状态
      if (railX < -past || flickClose) close();
      else open();
    }
  };

  const onPointerDown = (event) => {
    if (!isMobile()) return;
    const target = event.target;
    const onInteractive = target.closest && target.closest("button, a, input, select, textarea, label");
    if (onInteractive) return; // 交给点击/原生控件，保留按钮等语义
    const onRail = rail.contains(target);
    const onOverlay = target.closest && target.closest(".sidebar-overlay");
    const onEdge = !isOpen && event.clientX <= EDGE;
    if (onRail) dragContext = "rail";
    else if (onEdge) dragContext = "edge";
    else if (onOverlay) dragContext = "overlay";
    else return;
    event.preventDefault();
    beginDrag(event.clientX, event.pointerId);
  };

  document.addEventListener("pointerdown", onPointerDown);
  // 拖拽全程挂在 window 上，保证指针离开 rail 也能持续跟手
  window.addEventListener("pointermove", (event) => {
    if (dragging) moveDrag(event.clientX);
  });
  window.addEventListener("pointerup", () => {
    if (dragging) endDrag();
  });
  window.addEventListener("pointercancel", () => {
    if (dragging) endDrag();
  });

  if (toggle) toggle.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  // 选完工具后自动收起抽屉，避免遮挡内容
  document.querySelectorAll(".panel-chip").forEach((button) => {
    button.addEventListener("click", () => {
      if (isMobile()) close();
    });
  });

  // 回到桌面端时清理内联 transform，交还给 CSS 布局
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      cancelAnimationFrame(rafId);
      rail.style.transition = "";
      rail.style.transform = "";
      applyState(false);
    }
  });

  // 初始化：移动端把抽屉放到收起位置，桌面端交给 CSS
  if (isMobile()) {
    rail.style.transition = "none";
    setX(-railWidth());
  }
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
    `  --data '${bashSafeBody}'`,
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
    "  --data @-",
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
  bindMobileSidebar();
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
  bindPdfToImageActions();
}

document.addEventListener("DOMContentLoaded", init);

