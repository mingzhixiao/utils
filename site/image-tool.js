// ==================== 图片工具 ====================

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
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
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
      <strong>${escapeHtml(item.fileName)}</strong>
      <div class="meta">原始大小：${formatBytes(item.originalSize)} ｜ 压缩后：${formatBytes(item.compressedSize)} ｜ 缩减：${reduction}%</div>
      <div class="action-row">
        <a href="${escapeHtml(item.downloadUrl)}" download="${escapeHtml(item.fileName)}">下载</a>
      </div>
    `;
    container.appendChild(element);
  });
}

function renderImagePreviews(items) {
  const grid = $("imagePreviewGrid");
  if (!items.length) {
    grid.style.display = "none";
    grid.innerHTML = "";
    return;
  }
  grid.style.display = "grid";
  grid.innerHTML = "";
  items.forEach((item) => {
    const reduction = item.originalSize
      ? (((item.originalSize - item.compressedSize) / item.originalSize) * 100).toFixed(1)
      : "0.0";
    const card = document.createElement("div");
    card.className = "image-preview-card";
    card.innerHTML = `
      <div class="preview-thumb">
        <img src="${escapeHtml(item.thumbUrl)}" alt="${escapeHtml(item.fileName)}" />
      </div>
      <div class="preview-info">
        <strong class="preview-name" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</strong>
        <div class="preview-sizes">
          <span class="size-original">${formatBytes(item.originalSize)}</span>
          <span class="size-arrow">&rarr;</span>
          <span class="size-compressed">${formatBytes(item.compressedSize)}</span>
          <span class="size-reduction">-${reduction}%</span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function updateCompressPreviews(quality) {
  if (!state.imageCompressPreviews.length) return;
  const results = await Promise.all(
    state.imageCompressPreviews.map((p) => compressSingleImage(p.file, quality))
  );
  state.imageCompressPreviews = state.imageCompressPreviews.map((p, i) => ({
    ...p,
    compressedSize: results[i].compressedSize,
    downloadUrl: results[i].downloadUrl,
  }));
  renderImagePreviews(state.imageCompressPreviews);
}

async function loadCompressPreviews(files) {
  const items = await Promise.all(
    files.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImage(dataUrl);
      // Generate small thumbnail (120px wide)
      const thumbCanvas = document.createElement("canvas");
      const scale = Math.min(1, 120 / img.width);
      thumbCanvas.width = 120;
      thumbCanvas.height = Math.round(img.height * scale);
      const tCtx = thumbCanvas.getContext("2d");
      tCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumbUrl = thumbCanvas.toDataURL("image/jpeg", 0.7);
      return { file, thumbUrl, originalSize: file.size, compressedSize: file.size, downloadUrl: "" };
    })
  );
  state.imageCompressPreviews = items;
  return items;
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
  const safeColumns = Math.max(4, Number(state.imageCompareSettings.columns) || 4);
  const safeZoom = Math.min(180, Math.max(60, Number(state.imageCompareSettings.zoom) || 60));
  const { failedOnly } = state.imageCompareSettings;
  state.imageCompareSettings.columns = safeColumns;
  state.imageCompareSettings.zoom = safeZoom;
  container.style.setProperty("--image-columns", String(safeColumns));
  container.style.setProperty("--preview-height", `${Math.round((safeZoom / 100) * 240)}px`);
  setText("imageCompareZoomValue", `${safeZoom}%`);
  $("imageCompareColumns").value = String(safeColumns);
  $("imageCompareZoom").value = String(safeZoom);
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
    <img src="${escapeHtml(item.url)}" alt="image-${index}" loading="lazy" referrerpolicy="no-referrer" />
    <div class="image-placeholder"></div>
    <div class="meta">${escapeHtml(item.url)}</div>
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
    // Debounced real-time re-compress
    clearTimeout(state.compressDebounceTimer);
    state.compressDebounceTimer = setTimeout(() => {
      updateCompressPreviews(Number(event.target.value) / 100);
    }, 200);
  });

  $("imageCompressInput").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      state.imageCompressPreviews = [];
      renderImagePreviews([]);
      return;
    }
    await loadCompressPreviews(files);
    renderImagePreviews(state.imageCompressPreviews);
    // Auto-compress at current quality
    await updateCompressPreviews(Number($("compressQuality").value) / 100);
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
    compressImages: () => {
      if (!state.imageCompressPreviews.length) {
        throw new Error("请先选择图片");
      }
      state.imageCompressPreviews.forEach((p) => {
        if (p.downloadUrl) {
          const a = document.createElement("a");
          a.href = p.downloadUrl;
          a.download = p.file.name.replace(/\.[^.]+$/, "") + "-compressed.jpg";
          a.click();
          setTimeout(() => URL.revokeObjectURL(p.downloadUrl), 1000);
        }
      });
      showToast(`已下载 ${state.imageCompressPreviews.length} 张图片`);
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
