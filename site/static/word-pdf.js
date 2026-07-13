// word-pdf.js — Word 转 PDF 工具。依赖 excel.js 的 downloadExcelBlob 与全局 mammoth/jspdf/html2canvas。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

function showWordPdfProgress(message, type = "") {
  const progress = $("wordPdfProgress");
  progress.textContent = message;
  progress.className = `word-pdf-progress${type ? ` ${type}` : ""}`;
  clearTimeout(state.wordPdfProgressTimer);
  if (type === "success" || type === "error") {
    state.wordPdfProgressTimer = setTimeout(() => {
      progress.textContent = "";
      progress.className = "word-pdf-progress";
    }, 4000);
  }
}


async function handleWordPdfFile(file) {
  if (!file) {
    return;
  }
  if (!/\.docx$|\.docm$/i.test(file.name)) {
    showToast("仅支持 .docx / .docm 文件", true);
    return;
  }
  setText("wordPdfBadge", file.name);
  state.wordPdfFile = file;
  state.wordPdfBlob = null;
  $("wordPdfPreview").className = "word-pdf-preview empty-state";
  $("wordPdfPreview").textContent = "转换后可在此预览";
  $("wordPdfConvertBtn").disabled = false;
  $("wordPdfDownloadBtn").disabled = true;
  $("wordPdfClearBtn").style.display = "none";
  showWordPdfProgress("已选择文件，点击「转换为 PDF」", "");
}


async function convertWordToPdf() {
  if (!state.wordPdfFile) {
    throw new Error("请先选择 Word 文件");
  }
  await ensureVendor("mammoth");
  await ensureVendor("jspdf");
  await ensureVendor("html2canvas");
  const file = state.wordPdfFile;
  showWordPdfProgress("正在解析 Word 文档...", "");
  $("wordPdfConvertBtn").disabled = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;
    if (!html.trim()) {
      showWordPdfProgress("文档内容为空，无法转换", "error");
      $("wordPdfConvertBtn").disabled = false;
      return;
    }

    const preview = $("wordPdfPreview");
    preview.className = "word-pdf-preview";
    preview.innerHTML = `<div class="word-pdf-content">${html}</div>`;

    showWordPdfProgress("正在生成 PDF...", "");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    await pdf.html(preview.firstElementChild, {
      margin: [10, 10, 10, 10],
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      autoPaging: "text",
      filename: file.name.replace(/\.(docx|docm)$/i, ".pdf"),
    });

    state.wordPdfBlob = pdf.output("blob");
    $("wordPdfDownloadBtn").disabled = false;
    $("wordPdfClearBtn").style.display = "";
    showWordPdfProgress("转换完成，可下载 PDF", "success");
    showToast("已生成 PDF");
  } catch (error) {
    showWordPdfProgress(`转换失败：${error.message}`, "error");
    $("wordPdfConvertBtn").disabled = false;
  }
}


function downloadWordPdf() {
  if (!state.wordPdfBlob) {
    throw new Error("请先转换为 PDF");
  }
  const baseName = state.wordPdfFile ? state.wordPdfFile.name.replace(/\.(docx|docm)$/i, "") : "document";
  downloadExcelBlob(state.wordPdfBlob, `${baseName}.pdf`);
  showToast("已开始下载");
}


function clearWordPdf() {
  state.wordPdfFile = null;
  state.wordPdfBlob = null;
  setText("wordPdfBadge", "未选择");
  const preview = $("wordPdfPreview");
  preview.className = "word-pdf-preview empty-state";
  preview.textContent = "转换后可在此预览";
  $("wordPdfConvertBtn").disabled = true;
  $("wordPdfDownloadBtn").disabled = true;
  $("wordPdfClearBtn").style.display = "none";
  showWordPdfProgress("已清空", "success");
}


function bindWordPdfActions() {
  const dropZone = $("wordPdfDropZone");
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
      handleWordPdfFile(event.dataTransfer.files[0]);
    }
  });

  $("wordPdfFileInput").addEventListener("change", (event) => {
    if (event.target.files.length) {
      handleWordPdfFile(event.target.files[0]);
      event.target.value = "";
    }
  });

  const actions = {
    wordPdfConvert: () => convertWordToPdf(),
    wordPdfDownload: () => downloadWordPdf(),
    wordPdfClear: () => clearWordPdf(),
  };
  bindActions(actions);
}

