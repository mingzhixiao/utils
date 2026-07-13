// excel.js — Office 文档内嵌图片提取工具。依赖全局 JSZip。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

function getExcelImageExt(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/bmp") return "bmp";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "image/tiff") return "tiff";
  if (mimeType === "image/x-emf" || mimeType === "image/emf") return "emf";
  if (mimeType === "image/x-wmf" || mimeType === "image/wmf") return "wmf";
  return "img";
}


function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.readAsDataURL(blob);
  });
}


function downloadExcelBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


async function fetchBlob(url) {
  const response = await fetch(url);
  return response.blob();
}


function detectOfficeMediaFolder(fileName) {
  if (/\.xlsx$|\.xlsm$/i.test(fileName)) return "xl/media";
  if (/\.docx$|\.docm$/i.test(fileName)) return "word/media";
  return null;
}


function detectOfficeLabel(fileName) {
  if (/\.docx$|\.docm$/i.test(fileName)) return "Word";
  if (/\.xlsx$|\.xlsm$/i.test(fileName)) return "Excel";
  return "Office";
}


async function extractOfficeImages(file) {
  await ensureVendor("jszip");
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const mediaPath = detectOfficeMediaFolder(file.name);
  const mediaFolder = mediaPath ? zip.folder(mediaPath) : null;
  if (!mediaFolder) {
    return [];
  }

  const names = [];
  mediaFolder.forEach((relativePath, entry) => {
    if (!entry.dir) {
      names.push(relativePath);
    }
  });
  names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const images = [];
  for (const name of names) {
    const entry = mediaFolder.file(name);
    if (!entry) {
      continue;
    }
    const blob = await entry.async("blob");
    const url = URL.createObjectURL(blob);
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : getExcelImageExt(blob.type);
    images.push({
      name: `image_${String(images.length + 1).padStart(2, "0")}.${ext}`,
      originalName: name,
      size: blob.size,
      mime: blob.type,
      url,
      selected: true,
    });
  }
  return images;
}


function showExcelProgress(message, type = "") {
  const progress = $("excelProgress");
  progress.textContent = message;
  progress.className = `excel-progress${type ? ` ${type}` : ""}`;
  clearTimeout(state.excelProgressTimer);
  if (type === "success" || type === "error") {
    state.excelProgressTimer = setTimeout(() => {
      progress.textContent = "";
      progress.className = "excel-progress";
    }, 4000);
  }
}


function renderExcelImages() {
  const grid = $("excelImageGrid");
  const images = state.excelImages;
  const selected = images.filter((img) => img.selected).length;
  const totalSize = images.reduce((sum, img) => sum + img.size, 0);

  setText("excelTotalCount", images.length);
  setText("excelSelectedCount", selected);
  setText("excelTotalSize", formatBytes(totalSize));

  $("excelDownloadBtn").disabled = selected === 0;
  $("excelDownloadZipBtn").disabled = images.length === 0;
  $("excelClearBtn").style.display = images.length ? "" : "none";

  if (!images.length) {
    grid.className = "excel-image-grid empty-state";
    grid.textContent = "选择 Excel 文件后可提取其中的图片";
    return;
  }

  grid.className = "excel-image-grid";
  grid.innerHTML = "";
  images.forEach((img) => {
    const card = document.createElement("label");
    card.className = `excel-image-card${img.selected ? " selected" : ""}`;
    card.innerHTML = `
      <input type="checkbox" class="excel-check" ${img.selected ? "checked" : ""} />
      <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.originalName)}" loading="lazy" />
      <div class="meta">
        <div class="name">${escapeHtml(img.name)}</div>
        <div class="size">${formatBytes(img.size)}</div>
      </div>
    `;
    const checkbox = card.querySelector(".excel-check");
    checkbox.addEventListener("change", () => {
      img.selected = checkbox.checked;
      card.classList.toggle("selected", img.selected);
      renderExcelImages();
    });
    grid.appendChild(card);
  });
}


async function handleOfficeFile(file) {
  if (!file) {
    return;
  }
  if (!/\.xlsx$|\.xlsm$|\.docx$|\.docm$/i.test(file.name)) {
    showToast("仅支持 .xlsx / .xlsm / .docx / .docm 文件", true);
    return;
  }

  const label = detectOfficeLabel(file.name);
  showExcelProgress(`正在解析 ${label} 文件...`, "");
  setText("excelFileBadge", file.name);
  state.excelImages.forEach((img) => URL.revokeObjectURL(img.url));
  state.excelImages = [];
  renderExcelImages();

  try {
    const images = await extractOfficeImages(file);
    if (!images.length) {
      showExcelProgress(`该 ${label} 文件中未检测到内嵌图片`, "error");
      setText("excelFileBadge", "无图片");
      return;
    }
    state.excelImages = images;
    renderExcelImages();
    showExcelProgress(`提取完成，共 ${images.length} 张图片`, "success");
    showToast(`已提取 ${images.length} 张图片`);
  } catch (error) {
    showExcelProgress(`解析失败：${error.message}`, "error");
    setText("excelFileBadge", "解析失败");
  }
}


async function excelDownloadSelected() {
  const selected = state.excelImages.filter((img) => img.selected);
  if (!selected.length) {
    throw new Error("请先勾选要下载的图片");
  }
  if (selected.length === 1) {
    const blob = await fetchBlob(selected[0].url);
    downloadExcelBlob(blob, selected[0].name);
    showToast("已开始下载");
    return;
  }
  for (const img of selected) {
    const blob = await fetchBlob(img.url);
    downloadExcelBlob(blob, img.name);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  showToast(`已下载 ${selected.length} 张图片`);
}


async function excelDownloadZip() {
  if (!state.excelImages.length) {
    throw new Error("没有可下载的图片");
  }
  const selected = state.excelImages.filter((img) => img.selected);
  const source = selected.length ? selected : state.excelImages;

  showExcelProgress(`正在打包 ${source.length} 张图片...`, "");
  const zip = new JSZip();
  for (const img of source) {
    const blob = await fetchBlob(img.url);
    const base64 = await blobToBase64(blob);
    zip.file(img.name, base64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadExcelBlob(blob, `office_images_${new Date().toISOString().slice(0, 10)}.zip`);
  showExcelProgress(`已打包 ${source.length} 张图片`, "success");
  showToast("ZIP 已生成");
}


function bindExcelActions() {
  const dropZone = $("excelDropZone");
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
      handleOfficeFile(event.dataTransfer.files[0]);
    }
  });

  $("excelFileInput").addEventListener("change", (event) => {
    if (event.target.files.length) {
      handleOfficeFile(event.target.files[0]);
      event.target.value = "";
    }
  });

  const actions = {
    excelSelectAll: () => {
      if (!state.excelImages.length) throw new Error("请先选择 Excel 文件");
      state.excelImages.forEach((img) => (img.selected = true));
      renderExcelImages();
    },
    excelSelectNone: () => {
      if (!state.excelImages.length) throw new Error("请先选择 Excel 文件");
      state.excelImages.forEach((img) => (img.selected = false));
      renderExcelImages();
    },
    excelDownloadSelected: () => excelDownloadSelected(),
    excelDownloadZip: () => excelDownloadZip(),
    excelClearList: () => {
      state.excelImages.forEach((img) => URL.revokeObjectURL(img.url));
      state.excelImages = [];
      setText("excelFileBadge", "未选择");
      renderExcelImages();
      showExcelProgress("已清空", "success");
    },
  };
  bindActions(actions);
}



