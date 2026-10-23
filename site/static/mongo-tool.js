/* mongo-tool.js — JSON 生成 MongoDB 插入与修改语句 */
/* 依赖全局函数（定义在 core.js）：$、setText、setOutput、showToast、bindActions */

const mongoExamples = {
  HOTEL_IMAGE: `[
  {
    "_id": "2a83790eed08dbaedde5245bd17e249b",
    "_class": "com.huoli.newhotel.crawler.bean.mongo.base.HotelImage",
    "hotelId": "elong_64861717",
    "roomId": "",
    "type": 5,
    "size": 1,
    "location": "https://pavo.elongstatic.com/i/Hotel870_470/ZgIYzt7Zsc.jpg",
    "isCoverImage": true,
    "cityId": "0101",
    "isRoomCoverImage": false,
    "realWidth": 705,
    "realHeight": 394,
    "waterMark": 1,
    "ossUrl": "http://huoli-hotel.oss-cn-beijing.aliyuncs.com/hotel/image/0101/64861717/5//1/Hotel870_470/ZgIYzt7Zsc.jpg?Expires=2022563983&OSSAccessKeyId=LTAIqQSReHFTWWUs&Signature=UMYmPcr%2Bp7sd5Ta26SzFNYDDKH0%3D",
    "huoliId": "hl_5429198"
  },
  {
    "_id": "2589a3d10633f0ba96d350f5efb00720",
    "_class": "com.huoli.newhotel.crawler.bean.mongo.base.HotelImage",
    "hotelId": "elong_64861717",
    "roomId": "",
    "type": 5,
    "size": 7,
    "location": "https://pavo.elongstatic.com/i/Mobile640_960/ZgIYzt7Zsc.jpg",
    "isCoverImage": true,
    "cityId": "0101",
    "isRoomCoverImage": false,
    "realWidth": 640,
    "realHeight": 891,
    "waterMark": 1,
    "ossUrl": "http://huoli-hotel.oss-cn-beijing.aliyuncs.com/hotel/image/0101/64861717/5//7/Mobile640_960/ZgIYzt7Zsc.jpg?Expires=2022563983&OSSAccessKeyId=LTAIqQSReHFTWWUs&Signature=v%2BdAOeo4fLOHoVHmQoaFP5EwW%2Bc%3D",
    "huoliId": "hl_5429198"
  }
]`,
  CUSTOM_KEY: `[
  {
    "hotelId": "elong_64861717",
    "hotelName": "北京国际饭店",
    "star": 5,
    "cityCode": "0101",
    "status": "OPEN",
    "roomsCount": 128,
    "tags": ["商务出行", "近地铁", "含早餐"]
  },
  {
    "hotelId": "elong_64861718",
    "hotelName": "王府井大饭店",
    "star": 4,
    "cityCode": "0101",
    "status": "OPEN",
    "roomsCount": 85,
    "tags": ["市中心", "亲子度假"]
  }
]`
};

let lastParsedFields = [];
let userManuallySelectedKey = false;

/**
 * 解析用户输入的 JSON（支持标准 JSON 数组/对象，以及行式 JSONL）
 */
function parseMongoJson(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return { docs: [], error: null };
  }

  // 1. 尝试直接标准解析
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return { docs: parsed.filter((item) => item && typeof item === "object"), error: null };
    }
    if (parsed && typeof parsed === "object") {
      return { docs: [parsed], error: null };
    }
    return { docs: [], error: "输入的 JSON 必须是对象或数组" };
  } catch (err) {
    // 2. 尝试容错：逐行解析（JSONL）
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const lineDocs = [];
      let allLinesValid = true;
      for (const line of lines) {
        try {
          const item = JSON.parse(line.replace(/,$/, ""));
          if (item && typeof item === "object") {
            lineDocs.push(item);
          }
        } catch {
          allLinesValid = false;
          break;
        }
      }
      if (allLinesValid && lineDocs.length > 0) {
        return { docs: lineDocs, error: null };
      }
    }

    // 3. 尝试去除前后常见的多余字符或末尾逗号
    try {
      const cleaned = trimmed.replace(/,\s*([\]}])/g, "$1");
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return { docs: parsed.filter((item) => item && typeof item === "object"), error: null };
      }
      if (parsed && typeof parsed === "object") {
        return { docs: [parsed], error: null };
      }
    } catch {
      // 忽略
    }

    return { docs: [], error: err.message };
  }
}

/**
 * 扫描文档中出现的所有顶层 key
 */
function scanDocumentKeys(docs) {
  const keySet = new Set();
  docs.forEach((doc) => {
    if (doc && typeof doc === "object") {
      Object.keys(doc).forEach((k) => keySet.add(k));
    }
  });

  const keys = Array.from(keySet);
  // 如果有 _id，排在第一位
  keys.sort((a, b) => {
    if (a === "_id") return -1;
    if (b === "_id") return 1;
    return a.localeCompare(b);
  });
  return keys;
}

/**
 * 刷新主键推荐标签与下拉列表
 */
function updateKeyFieldsUI(docs) {
  const keys = scanDocumentKeys(docs);
  lastParsedFields = keys;

  const keySelect = $("mongoKeySelect");
  const keyDatalist = $("mongoKeyDatalist");
  const tagContainer = $("mongoKeyTags");
  const currentKeyInput = $("mongoKeyField");

  if (keySelect) {
    keySelect.innerHTML = "";
    if (keys.length === 0) {
      keySelect.innerHTML = `<option value="_id">_id (默认)</option>`;
    } else {
      keys.forEach((k) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k === "_id" ? "_id (默认主键)" : k;
        keySelect.appendChild(opt);
      });
      const customOpt = document.createElement("option");
      customOpt.value = "__custom__";
      customOpt.textContent = "+ 自定义字段...";
      keySelect.appendChild(customOpt);
    }
  }

  if (keyDatalist) {
    keyDatalist.innerHTML = "";
    keys.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      keyDatalist.appendChild(opt);
    });
  }

  // 渲染可点击的小 Tag
  if (tagContainer) {
    tagContainer.innerHTML = "";
    if (keys.length > 0) {
      const label = document.createElement("span");
      label.className = "mongo-tag-label";
      label.textContent = "检测到字段: ";
      tagContainer.appendChild(label);

      keys.slice(0, 10).forEach((k) => {
        const tag = document.createElement("button");
        tag.type = "button";
        tag.className = "mongo-field-tag" + (currentKeyInput && currentKeyInput.value === k ? " active" : "");
        tag.textContent = k;
        tag.title = `点击将 ${k} 设为主键`;
        tag.addEventListener("click", () => {
          userManuallySelectedKey = true;
          if (currentKeyInput) {
            currentKeyInput.value = k;
          }
          if (keySelect) {
            keySelect.value = k;
          }
          highlightActiveKeyTag();
          runGenerateMongo();
        });
        tagContainer.appendChild(tag);
      });
    }
  }

  // 智能自动选取主键：
  // 如果文档里含有 _id，且用户尚未强制手工指定其他字段，则优先设为 _id
  if (!userManuallySelectedKey && currentKeyInput) {
    if (keys.includes("_id")) {
      currentKeyInput.value = "_id";
      if (keySelect) keySelect.value = "_id";
    } else if (keys.length > 0) {
      // 没有 _id 时，默认取第一个字段（例如 hotelId / id）
      const candidate = keys.find((k) => /^(id|.*Id|code|key|uuid)$/i.test(k)) || keys[0];
      currentKeyInput.value = candidate;
      if (keySelect) keySelect.value = candidate;
    }
  }

  highlightActiveKeyTag();
}

function highlightActiveKeyTag() {
  const currentKey = ($("mongoKeyField")?.value || "").trim();
  const tags = document.querySelectorAll(".mongo-field-tag");
  tags.forEach((tag) => {
    tag.classList.toggle("active", tag.textContent === currentKey);
  });
}

function indentBlock(str, spaces = 2) {
  const pad = " ".repeat(spaces);
  return str
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

/**
 * 执行生成 MongoDB 语句
 */
function runGenerateMongo() {
  const rawInput = $("mongoInput").value;
  const { docs, error } = parseMongoJson(rawInput);

  if (error) {
    setText("mongoInputBadge", "JSON 语法错误");
    $("mongoInputBadge").classList.add("badge-error");
    setText("mongoStatDocCount", "0");
    setOutput("mongoOutput", `// 无法解析输入 JSON: ${error}\n// 请检查 JSON 格式是否有效。`);
    return;
  }

  $("mongoInputBadge").classList.remove("badge-error");
  const count = docs.length;
  setText("mongoInputBadge", `${count} 条记录`);
  setText("mongoStatDocCount", String(count));

  if (count === 0) {
    setOutput("mongoOutput", "");
    setText("mongoStatMode", "-");
    setText("mongoStatKeyField", "-");
    return;
  }

  // 集合名
  let collectionName = ($("mongoCollection").value || "").trim();
  if (!collectionName) {
    collectionName = "hotelNewImage";
    $("mongoCollection").value = collectionName;
  }
  setText("mongoStatCollection", collectionName);

  // 主键字段
  const primaryKey = ($("mongoKeyField").value || "").trim() || "_id";
  setText("mongoStatKeyField", primaryKey);

  // 配置项
  const opType = $("mongoOpType")?.value || "updateOne";
  const isUpsert = $("mongoOptUpsert")?.checked ?? true;
  const excludePkInSet = $("mongoOptExcludePk")?.checked ?? true;
  const excludeClass = $("mongoOptExcludeClass")?.checked ?? false;
  const compactMode = $("mongoOptCompact")?.checked ?? false;

  const stringify = (val) => (compactMode ? JSON.stringify(val) : JSON.stringify(val, null, 2));

  let outputText = "";
  let missingKeyCount = 0;

  switch (opType) {
    case "updateOne": {
      // 单条 updateOne: db.collection.updateOne(filter, { $set: updateDoc }, { upsert: true });
      setText("mongoStatMode", `updateOne (${isUpsert ? "upsert" : "update"})`);
      const statements = docs.map((doc) => {
        const keyVal = doc[primaryKey];
        if (typeof keyVal === "undefined") {
          missingKeyCount++;
        }
        const filter = { [primaryKey]: keyVal !== undefined ? keyVal : null };

        // 构造 $set 对象
        const updateDoc = {};
        Object.keys(doc).forEach((k) => {
          if (excludePkInSet && k === primaryKey) {
            return;
          }
          if (excludeClass && k === "_class") {
            return;
          }
          updateDoc[k] = doc[k];
        });

        const filterStr = stringify(filter);
        const updateStr = stringify({ $set: updateDoc });

        if (compactMode) {
          const optStr = isUpsert ? `, { "upsert": true }` : "";
          return `db.${collectionName}.updateOne(${filterStr}, ${updateStr}${optStr});`;
        }

        if (isUpsert) {
          return `db.${collectionName}.updateOne(\n${indentBlock(filterStr)},\n${indentBlock(updateStr)},\n  { "upsert": true }\n);`;
        } else {
          return `db.${collectionName}.updateOne(\n${indentBlock(filterStr)},\n${indentBlock(updateStr)}\n);`;
        }
      });

      let header = `// MongoDB updateOne 操作语句 (共 ${count} 条)\n// 目标集合: ${collectionName} | 主键字段: ${primaryKey}\n\n`;
      if (missingKeyCount > 0) {
        header += `// ⚠️ 警告: 有 ${missingKeyCount} 条记录缺失主键字段 "${primaryKey}"，其 filter 中主键值为 null！\n\n`;
      }
      outputText = header + statements.join("\n\n");
      break;
    }

    case "bulkWrite": {
      // 批量更新: db.collection.bulkWrite([ { updateOne: { filter, update, upsert } }, ... ]);
      setText("mongoStatMode", "bulkWrite (批量写入)");
      const operations = docs.map((doc) => {
        const keyVal = doc[primaryKey];
        if (typeof keyVal === "undefined") {
          missingKeyCount++;
        }
        const filter = { [primaryKey]: keyVal !== undefined ? keyVal : null };

        const updateDoc = {};
        Object.keys(doc).forEach((k) => {
          if (excludePkInSet && k === primaryKey) {
            return;
          }
          if (excludeClass && k === "_class") {
            return;
          }
          updateDoc[k] = doc[k];
        });

        const op = {
          updateOne: {
            filter: filter,
            update: { $set: updateDoc },
          },
        };
        if (isUpsert) {
          op.updateOne.upsert = true;
        }
        return op;
      });

      let header = `// MongoDB bulkWrite 批量更新语句 (共 ${count} 个操作)\n// 目标集合: ${collectionName} | 主键字段: ${primaryKey}\n\n`;
      if (missingKeyCount > 0) {
        header += `// ⚠️ 警告: 有 ${missingKeyCount} 条记录缺失主键字段 "${primaryKey}"！\n\n`;
      }

      if (compactMode) {
        outputText = `${header}db.${collectionName}.bulkWrite(${JSON.stringify(operations)});`;
      } else {
        outputText = `${header}db.${collectionName}.bulkWrite(\n${JSON.stringify(operations, null, 2)}\n);`;
      }
      break;
    }

    case "insertMany": {
      // 批量插入: db.collection.insertMany([ ... ]);
      setText("mongoStatMode", "insertMany (批量插入)");
      const cleanedDocs = docs.map((doc) => {
        if (!excludeClass) return doc;
        const copy = { ...doc };
        delete copy._class;
        return copy;
      });

      let header = `// MongoDB insertMany 插入语句 (共 ${count} 条)\n// 目标集合: ${collectionName}\n\n`;
      if (compactMode) {
        outputText = `${header}db.${collectionName}.insertMany(${JSON.stringify(cleanedDocs)});`;
      } else {
        outputText = `${header}db.${collectionName}.insertMany(\n${JSON.stringify(cleanedDocs, null, 2)}\n);`;
      }
      break;
    }

    case "insertOne": {
      // 逐条插入: db.collection.insertOne({ ... });
      setText("mongoStatMode", "insertOne (逐条插入)");
      const statements = docs.map((doc) => {
        let targetDoc = doc;
        if (excludeClass) {
          targetDoc = { ...doc };
          delete targetDoc._class;
        }
        if (compactMode) {
          return `db.${collectionName}.insertOne(${JSON.stringify(targetDoc)});`;
        }
        return `db.${collectionName}.insertOne(\n${indentBlock(JSON.stringify(targetDoc, null, 2))}\n);`;
      });

      const header = `// MongoDB insertOne 插入语句 (共 ${count} 条)\n// 目标集合: ${collectionName}\n\n`;
      outputText = header + statements.join("\n\n");
      break;
    }

    case "replaceOne": {
      // 替换整个文档: db.collection.replaceOne(filter, replacement, { upsert: true });
      setText("mongoStatMode", `replaceOne (${isUpsert ? "upsert" : "replace"})`);
      const statements = docs.map((doc) => {
        const keyVal = doc[primaryKey];
        if (typeof keyVal === "undefined") {
          missingKeyCount++;
        }
        const filter = { [primaryKey]: keyVal !== undefined ? keyVal : null };

        let replacement = doc;
        if (excludeClass) {
          replacement = { ...doc };
          delete replacement._class;
        }

        const filterStr = stringify(filter);
        const replaceStr = stringify(replacement);

        if (compactMode) {
          const optStr = isUpsert ? `, { "upsert": true }` : "";
          return `db.${collectionName}.replaceOne(${filterStr}, ${replaceStr}${optStr});`;
        }

        if (isUpsert) {
          return `db.${collectionName}.replaceOne(\n${indentBlock(filterStr)},\n${indentBlock(replaceStr)},\n  { "upsert": true }\n);`;
        } else {
          return `db.${collectionName}.replaceOne(\n${indentBlock(filterStr)},\n${indentBlock(replaceStr)}\n);`;
        }
      });

      let header = `// MongoDB replaceOne 替换语句 (共 ${count} 条)\n// 目标集合: ${collectionName} | 主键字段: ${primaryKey}\n\n`;
      if (missingKeyCount > 0) {
        header += `// ⚠️ 警告: 有 ${missingKeyCount} 条记录缺失主键字段 "${primaryKey}"！\n\n`;
      }
      outputText = header + statements.join("\n\n");
      break;
    }
  }

  setOutput("mongoOutput", outputText);
}

/**
 * 监听输入变动，自动扫描字段
 */
function handleMongoInputChange() {
  const raw = $("mongoInput").value;
  const { docs } = parseMongoJson(raw);
  updateKeyFieldsUI(docs);
  runGenerateMongo();
}

/**
 * 导出/下载为 .js 脚本文件
 */
function downloadMongoScript() {
  const content = $("mongoOutput")?.value;
  if (!content || !content.trim()) {
    showToast("没有可下载的 MongoDB 语句", true);
    return;
  }
  const coll = ($("mongoCollection")?.value || "mongo").trim();
  const filename = `${coll}_statements.js`;
  const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`已下载 ${filename}`);
}

/**
 * 模块入口绑定
 */
function bindMongoActions() {
  const actions = {
    generateMongo: () => runGenerateMongo(),
    fillMongoExampleUser: () => {
      userManuallySelectedKey = false;
      $("mongoCollection").value = "hotelNewImage";
      $("mongoInput").value = mongoExamples.HOTEL_IMAGE;
      const { docs } = parseMongoJson(mongoExamples.HOTEL_IMAGE);
      updateKeyFieldsUI(docs);
      runGenerateMongo();
      showToast("已载入 hotelNewImage 示例数据");
    },
    fillMongoExampleCustomKey: () => {
      userManuallySelectedKey = false;
      $("mongoCollection").value = "hotelList";
      $("mongoInput").value = mongoExamples.CUSTOM_KEY;
      const { docs } = parseMongoJson(mongoExamples.CUSTOM_KEY);
      updateKeyFieldsUI(docs);
      // 设定主键为 hotelId
      if ($("mongoKeyField")) {
        $("mongoKeyField").value = "hotelId";
      }
      if ($("mongoKeySelect")) {
        $("mongoKeySelect").value = "hotelId";
      }
      highlightActiveKeyTag();
      runGenerateMongo();
      showToast("已载入自定义主键 hotelId 示例");
    },
    clearMongoPanels: () => {
      userManuallySelectedKey = false;
      $("mongoInput").value = "";
      $("mongoOutput").value = "";
      $("mongoCollection").value = "hotelNewImage";
      $("mongoKeyField").value = "_id";
      setText("mongoInputBadge", "0 条记录");
      setText("mongoStatDocCount", "0");
      setText("mongoStatCollection", "hotelNewImage");
      setText("mongoStatKeyField", "_id");
      setText("mongoStatMode", "-");
      const tagContainer = $("mongoKeyTags");
      if (tagContainer) tagContainer.innerHTML = "";
      $("mongoInput").focus();
      showToast("已清空");
    },
    downloadMongoScript: () => downloadMongoScript(),
  };

  bindActions(actions);

  // 输入变化实时监听（防抖）
  let debounceTimer = null;
  const inputEl = $("mongoInput");
  if (inputEl) {
    inputEl.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleMongoInputChange, 250);
    });

    // 快捷键 Ctrl+Enter 或 Cmd+Enter
    inputEl.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runGenerateMongo();
        showToast("已生成 MongoDB 语句");
      }
    });
  }

  // 监听配置项变化自动更新
  ["mongoCollection", "mongoKeyField"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", () => {
        if (id === "mongoKeyField") {
          userManuallySelectedKey = true;
          highlightActiveKeyTag();
          if ($("mongoKeySelect")) {
            $("mongoKeySelect").value = el.value || "__custom__";
          }
        }
        runGenerateMongo();
      });
    }
  });

  const keySelect = $("mongoKeySelect");
  if (keySelect) {
    keySelect.addEventListener("change", () => {
      const selected = keySelect.value;
      if (selected === "__custom__") {
        $("mongoKeyField").focus();
      } else {
        userManuallySelectedKey = true;
        $("mongoKeyField").value = selected;
        highlightActiveKeyTag();
        runGenerateMongo();
      }
    });
  }

  ["mongoOpType", "mongoOptUpsert", "mongoOptExcludePk", "mongoOptExcludeClass", "mongoOptCompact"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("change", () => {
        runGenerateMongo();
      });
    }
  });
}
