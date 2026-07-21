// fapiao.js — 发票合并工具（PDF/Word）。依赖 image-tool.js 的 readFileAsDataUrl/loadImage 与全局 JSZip。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

function updateFapiaoPageSizeUi() {
  const isCustom = $("fapiaoPageSize").value === "custom";
  $("fapiaoCustomWidthGroup").classList.toggle("hidden-field", !isCustom);
  $("fapiaoCustomHeightGroup").classList.toggle("hidden-field", !isCustom);
  // 同步自定义输入框的值，确保切换 A4/A5 时 UI 显示正确的尺寸
  const { w, h } = getFapiaoPageSizeMM();
  $("fapiaoPageWidth").value = (w / 10).toFixed(1);
  $("fapiaoPageHeight").value = (h / 10).toFixed(1);
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


function bindFapiaoItemDrag(item) {
  const previewList = $("fapiaoPreviewList");
  let startY = 0;
  let grabOffset = 0;
  let pointerId = null;
  let pending = false;
  let dragging = false;

  item.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".del-btn")) return; // 删除按钮不触发拖拽
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pending = true;
    dragging = false;
    startY = event.clientY;
    pointerId = event.pointerId;
    const rect = item.getBoundingClientRect();
    grabOffset = event.clientY - rect.top; // 尊重抓取点，避免吸附到中心 (Apple Design §2)
  });

  item.addEventListener("pointermove", (event) => {
    if (!pending && !dragging) return;
    const dy = event.clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) < 5) return; // 阈值，避免把点击误判为拖拽
      dragging = true;
      try {
        item.setPointerCapture(pointerId);
      } catch (_) {}
      item.classList.add("dragging");
      document.body.classList.add("is-dragging");
    }
    event.preventDefault();
    // 找到手指应插入到哪个兄弟之前
    const list = previewList;
    const siblings = Array.from(list.children);
    let ref = null;
    for (const sib of siblings) {
      if (sib === item) continue;
      const r = sib.getBoundingClientRect();
      if (event.clientY < r.top + r.height / 2) {
        ref = sib;
        break;
      }
    }
    if (ref !== item) {
      list.insertBefore(item, ref);
    }
    // 让元素保持在手指抓取点下，全程 1:1 跟手
    const listRect = list.getBoundingClientRect();
    const desiredTop = event.clientY - grabOffset - listRect.top;
    const offset = desiredTop - item.offsetTop;
    item.style.transform = `translateY(${offset}px)`;
  });

  const endDrag = () => {
    if (!pending && !dragging) return;
    pending = false;
    if (!dragging) return; // 未越过阈值，视为普通点击
    dragging = false;
    try {
      item.releasePointerCapture(pointerId);
    } catch (_) {}
    document.body.classList.remove("is-dragging");
    item.classList.remove("dragging");
    // 提交顺序到 state，再重渲染清理临时 transform
    const order = Array.from(previewList.children).map((el) => Number(el.dataset.index));
    const source = state.fapiaoImageFiles;
    state.fapiaoImageFiles = order.map((i) => source[i]);
    renderFapiaoPreview();
  };

  item.addEventListener("pointerup", endDrag);
  item.addEventListener("pointercancel", endDrag);
}


function renderFapiaoPreview() {
  const previewList = $("fapiaoPreviewList");
  // 回收上一次渲染创建的缩略图 object URL，避免拖拽排序/删除反复重渲染造成泄漏
  previewList.querySelectorAll("img.thumb").forEach((img) => {
    if (img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
  });
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

    bindFapiaoItemDrag(item);
    previewList.appendChild(item);
  });
}


async function renderPdfPageAsImage(pdf, pageNum, pdfFileName) {
  const page = await pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1 });
  // 限制画布尺寸，避免超大页超出浏览器 canvas 单边上限（约 16384px）
  const maxDim = 8192;
  const safeScale = Math.min(3, maxDim / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale: safeScale });
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

  await ensureVendor("pdfjs");
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


const _fapiaoImageCache = new WeakMap();

async function decodeFapiaoImage(file) {
  if (_fapiaoImageCache.has(file)) {
    return _fapiaoImageCache.get(file);
  }
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  _fapiaoImageCache.set(file, image);
  return image;
}

async function resizeFapiaoImage(file, imgW, imgH, quality = 0.92) {
  const image = await decodeFapiaoImage(file);
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
  await ensureVendor("jspdf");

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
  await ensureVendor("jszip");

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
    const image = await decodeFapiaoImage(state.fapiaoImageFiles[index]);
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

