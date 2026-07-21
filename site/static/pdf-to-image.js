// pdf-to-image.js — PDF 转图片工具。依赖全局 pdfjsLib（ensureVendor("pdfjs")）、JSZip、downloadExcelBlob / blobToBase64。
// 本文件与 word-pdf.js 同属"文档转换"面板，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

function showPdfImageProgress(message, type = "") {
  const progress = $("pdfImageProgress");
  progress.textContent = message;
  progress.className = `pdf-image-progress${type ? ` ${type}` : ""}`;
  clearTimeout(state.pdfImageProgressTimer);
  if (type === "success" || type === "error") {
    state.pdfImageProgressTimer = setTimeout(() => {
      progress.textContent = "";
      progress.className = "pdf-image-progress";
    }, 4000);
  }
}


function clearPdfImages() {
  state.pdfImages.forEach((img) => URL.revokeObjectURL(img.url));
  state.pdfImages = [];
}


async function handlePdfImageFile(file) {
  if (!file) {
    return;
  }
  if (!/\.pdf$/i.test(file.name)) {
    showToast("仅支持 .pdf 文件", true);
    return;
  }
  setText("pdfImageBadge", file.name);
  state.pdfImageFile = file;
  clearPdfImages();
  renderPdfImages();
  $("pdfImageConvertBtn").disabled = false;
  $("pdfImageDownloadAllBtn").disabled = true;
  $("pdfImageClearBtn").style.display = "none";
  showPdfImageProgress("已选择文件，点击「转为图片」", "");
}


function pdfImageFileName(page, ext) {
  const base = state.pdfImageFile ? state.pdfImageFile.name.replace(/\.pdf$/i, "") : "page";
  return `${base}_p${String(page).padStart(3, "0")}.${ext}`;
}


function renderPdfImageCard(img) {
  const grid = $("pdfImageGrid");
  grid.className = "pdf-image-grid";
  const card = document.createElement("div");
  card.className = "pdf-image-card";
  const ext = img.blob.type === "image/jpeg" ? "jpg" : "png";
  card.innerHTML = `
    <img src="${escapeHtml(img.url)}" alt="第 ${img.page} 页" loading="lazy" />
    <div class="meta">
      <div class="name">第 ${img.page} 页</div>
      <div class="size">${formatBytes(img.size)}</div>
    </div>
    <button type="button" class="pdf-image-download-btn" data-page="${img.page}">下载本页</button>
  `;
  card.querySelector(".pdf-image-download-btn").addEventListener("click", () => {
    downloadExcelBlob(img.blob, pdfImageFileName(img.page, ext));
  });
  grid.appendChild(card);
}


function renderPdfImages() {
  const grid = $("pdfImageGrid");
  const images = state.pdfImages;
  const totalSize = images.reduce((sum, img) => sum + img.size, 0);
  setText("pdfImageTotalSize", formatBytes(totalSize));
  $("pdfImageDownloadAllBtn").disabled = images.length === 0;
  $("pdfImageClearBtn").style.display = images.length ? "" : "none";
  if (!images.length) {
    grid.className = "pdf-image-grid empty-state";
    grid.textContent = "转换后可在此预览每一页";
    return;
  }
  grid.className = "pdf-image-grid";
  grid.innerHTML = "";
  images.forEach(renderPdfImageCard);
}


async function convertPdfToImages() {
  if (!state.pdfImageFile) {
    throw new Error("请先选择 PDF 文件");
  }
  await ensureVendor("pdfjs");
  const file = state.pdfImageFile;
  const scale = parseFloat($("pdfImageScale").value) || 2;
  const format = $("pdfImageFormat").value;
  const quality = format === "image/jpeg" ? 0.92 : undefined;

  showPdfImageProgress("正在解析 PDF...", "");
  $("pdfImageConvertBtn").disabled = true;
  setText("pdfImagePageCount", "0");
  setText("pdfImageConvertedCount", "0");
  clearPdfImages();
  renderPdfImages();

  let pdfDoc;
  try {
    const data = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const numPages = pdfDoc.numPages;
    setText("pdfImagePageCount", numPages);
    const grid = $("pdfImageGrid");
    grid.className = "pdf-image-grid";
    grid.innerHTML = "";

    for (let i = 1; i <= numPages; i++) {
      showPdfImageProgress(`正在转换第 ${i} / ${numPages} 页...`, "");
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (format === "image/jpeg") {
        // JPEG 无透明通道，先铺白底，避免透明区域变黑
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, format, quality));
      const url = URL.createObjectURL(blob);
      const img = { page: i, blob, url, size: blob.size };
      state.pdfImages.push(img);
      renderPdfImageCard(img);
      setText("pdfImageConvertedCount", i);
    }

    $("pdfImageDownloadAllBtn").disabled = state.pdfImages.length === 0;
    $("pdfImageClearBtn").style.display = state.pdfImages.length ? "" : "none";
    setText("pdfImageTotalSize", formatBytes(state.pdfImages.reduce((sum, img) => sum + img.size, 0)));
    showPdfImageProgress(`转换完成，共 ${state.pdfImages.length} 页`, "success");
    showToast("已生成图片");
  } catch (error) {
    showPdfImageProgress(`转换失败：${error.message}`, "error");
    $("pdfImageConvertBtn").disabled = false;
  } finally {
    if (pdfDoc) {
      await pdfDoc.destroy();
    }
  }
}


async function pdfImageDownloadAll() {
  if (!state.pdfImages.length) {
    throw new Error("没有可下载的图片");
  }
  await ensureVendor("jszip");
  showPdfImageProgress(`正在打包 ${state.pdfImages.length} 张图片...`, "");
  const zip = new JSZip();
  for (const img of state.pdfImages) {
    const base64 = await blobToBase64(img.blob);
    const ext = img.blob.type === "image/jpeg" ? "jpg" : "png";
    zip.file(`page_${String(img.page).padStart(3, "0")}.${ext}`, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const base = state.pdfImageFile ? state.pdfImageFile.name.replace(/\.pdf$/i, "") : "pdf";
  downloadExcelBlob(blob, `${base}_images.zip`);
  showPdfImageProgress(`已打包 ${state.pdfImages.length} 张图片`, "success");
  showToast("ZIP 已生成");
}


function clearPdfImage() {
  clearPdfImages();
  state.pdfImageFile = null;
  setText("pdfImageBadge", "未选择");
  setText("pdfImagePageCount", "0");
  setText("pdfImageConvertedCount", "0");
  setText("pdfImageTotalSize", "0 B");
  $("pdfImageConvertBtn").disabled = true;
  $("pdfImageDownloadAllBtn").disabled = true;
  $("pdfImageClearBtn").style.display = "none";
  renderPdfImages();
  showPdfImageProgress("已清空", "success");
}


function bindPdfToImageActions() {
  const dropZone = $("pdfImageDropZone");
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
      handlePdfImageFile(event.dataTransfer.files[0]);
    }
  });

  $("pdfImageFileInput").addEventListener("change", (event) => {
    if (event.target.files.length) {
      handlePdfImageFile(event.target.files[0]);
      event.target.value = "";
    }
  });

  bindActions({
    pdfImageConvert: () => convertPdfToImages(),
    pdfImageDownloadAll: () => pdfImageDownloadAll(),
    pdfImageClear: () => clearPdfImage(),
  });
}
