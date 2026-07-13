// es.js — Elasticsearch 查询转 Kibana Console / cURL。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

function parseFieldList(input) {
  return input
    .split(/[\n,，;；]/)
    .map((field) => field.trim())
    .filter(Boolean);
}


function getValueByPath(source, path) {
  if (!path) {
    return undefined;
  }
  return path.split(".").reduce((current, key) => {
    if (current == null) {
      return undefined;
    }
    return current[key];
  }, source);
}


function setValueByPath(target, path, value) {
  const keys = path.split(".");
  let current = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  });
}


function pickSourceFields(source, fieldPaths) {
  if (!fieldPaths.length || source == null || typeof source !== "object") {
    return source;
  }
  const picked = {};
  let matched = 0;
  fieldPaths.forEach((path) => {
    const value = getValueByPath(source, path);
    if (value !== undefined) {
      setValueByPath(picked, path, value);
      matched += 1;
    }
  });
  return matched ? picked : {};
}


function buildEsDocument(record, source, fallbackId, idField, sourceFields) {
  const sourceData = pickSourceFields(source, sourceFields);
  const resolvedId =
    record?._id ??
    getValueByPath(record, idField) ??
    getValueByPath(source, idField) ??
    fallbackId;

  return {
    id: String(resolvedId),
    index: record?._index ?? "",
    source: sourceData,
  };
}


function normalizeEsDocuments(input, idField, sourceFields) {
  if (Array.isArray(input)) {
    return input.map((item, index) =>
      buildEsDocument(item, item && typeof item === "object" && "_source" in item ? item._source : item, index + 1, idField, sourceFields)
    );
  }

  if (input?.hits?.hits && Array.isArray(input.hits.hits)) {
    return input.hits.hits.map((hit, index) =>
      buildEsDocument(hit, hit._source ?? hit.fields ?? hit, index + 1, idField, sourceFields)
    );
  }

  if (input && typeof input === "object") {
    return [buildEsDocument(input, input._source ?? input, 1, idField, sourceFields)];
  }

  throw new Error("无法识别 ES 查询结果格式");
}


function normalizeBaseUrl(baseUrl) {
  const trimmed = (baseUrl || "").trim() || "http://localhost:9200";
  return trimmed.replace(/\/+$/, "");
}


function encodeEsPathSegment(value) {
  return encodeURIComponent(String(value));
}


function ensureTrailingNewline(value) {
  if (!value) {
    return "";
  }
  return value.endsWith("\n") ? value : `${value}\n`;
}


function countOutputLines(value) {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmed = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmed ? trimmed.split("\n").length : 0;
}


const esModeLabels = {
  index: "Index API",
  update: "Update API",
  bulkIndex: "Bulk Index",
  bulkUpdate: "Bulk Update",
  bulkDelete: "Bulk Delete",
};


const esOutputStyleLabels = {
  console: "Kibana Console",
  curl: "cURL (bash)",
  curlPowerShell: "cURL (PowerShell)",
};


function syncEsSelectionMeta() {
  setText("esModeLabel", esModeLabels[$("esMode").value] || "-");
  setText("esFormatLabel", esOutputStyleLabels[$("esOutputStyle").value] || "-");
}


function resetEsOutputMeta() {
  setText("esDocumentCount", 0);
  setText("esOutputLineCount", 0);
  syncEsSelectionMeta();
}


function updateEsOutputMeta(documents, output) {
  setText("esDocumentCount", documents.length);
  setText("esOutputLineCount", countOutputLines(output));
  syncEsSelectionMeta();
}


function buildEsBulkBody(documents, mode, targetIndexName) {
  const lines = documents.flatMap((doc) => {
    const indexName = targetIndexName || doc.index || "your_index";
    if (mode === "bulkIndex") {
      return [
        JSON.stringify({ index: { _index: indexName, _id: doc.id } }),
        JSON.stringify(doc.source),
      ];
    }
    if (mode === "bulkUpdate") {
      return [
        JSON.stringify({ update: { _index: indexName, _id: doc.id } }),
        JSON.stringify({ doc: doc.source, doc_as_upsert: true }),
      ];
    }
    return [JSON.stringify({ delete: { _index: indexName, _id: doc.id } })];
  });
  return ensureTrailingNewline(lines.join("\n"));
}


function buildEsConsoleOutput(documents, mode, targetIndexName) {
  const lines = [];
  documents.forEach((doc) => {
    const indexName = targetIndexName || doc.index || "your_index";
    const encodedId = encodeEsPathSegment(doc.id);
    if (mode === "index") {
      lines.push(`PUT /${indexName}/_doc/${encodedId}`);
      lines.push(JSON.stringify(doc.source, null, 2));
      return;
    }
    if (mode === "update") {
      lines.push(`POST /${indexName}/_update/${encodedId}`);
      lines.push(
        JSON.stringify(
          {
            doc: doc.source,
            doc_as_upsert: true,
          },
          null,
          2
        )
      );
      return;
    }
    if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
      return;
    }
  });
  const output = lines.join("\n");
  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    return `POST /_bulk\n${buildEsBulkBody(documents, mode, targetIndexName)}`;
  }
  return output;
}


function buildEsCurlOutput(documents, mode, targetIndexName, baseUrl) {
  const rootUrl = normalizeBaseUrl(baseUrl);

  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    return buildCurlRequest(
      "POST",
      `${rootUrl}/_bulk`,
      buildEsBulkBody(documents, mode, targetIndexName),
      "application/x-ndjson"
    );
  }

  return documents
    .map((doc) => {
      const indexName = targetIndexName || doc.index || "your_index";
      const encodedId = encodeEsPathSegment(doc.id);
      if (mode === "index") {
        return buildCurlRequest(
          "PUT",
          `${rootUrl}/${indexName}/_doc/${encodedId}`,
          JSON.stringify(doc.source, null, 2)
        );
      }
      return buildCurlRequest(
        "POST",
        `${rootUrl}/${indexName}/_update/${encodedId}`,
        JSON.stringify(
          {
            doc: doc.source,
            doc_as_upsert: true,
          },
          null,
          2
        )
      );
    })
    .join("\n\n");
}


function buildEsPowerShellCurlOutput(documents, mode, targetIndexName, baseUrl) {
  const rootUrl = normalizeBaseUrl(baseUrl);

  if (mode === "bulkIndex" || mode === "bulkUpdate" || mode === "bulkDelete") {
    return buildPowerShellCurlRequest(
      "POST",
      `${rootUrl}/_bulk`,
      buildEsBulkBody(documents, mode, targetIndexName),
      "application/x-ndjson"
    );
  }

  return documents
    .map((doc) => {
      const indexName = targetIndexName || doc.index || "your_index";
      const encodedId = encodeEsPathSegment(doc.id);
      if (mode === "index") {
        return buildPowerShellCurlRequest(
          "PUT",
          `${rootUrl}/${indexName}/_doc/${encodedId}`,
          JSON.stringify(doc.source, null, 2)
        );
      }
      return buildPowerShellCurlRequest(
        "POST",
        `${rootUrl}/${indexName}/_update/${encodedId}`,
        JSON.stringify(
          {
            doc: doc.source,
            doc_as_upsert: true,
          },
          null,
          2
        )
      );
    })
    .join("\n\n");
}


function buildEsOutput(documents, mode, targetIndexName, outputStyle, baseUrl) {
  if (outputStyle === "curl") {
    return buildEsCurlOutput(documents, mode, targetIndexName, baseUrl);
  }
  if (outputStyle === "curlPowerShell") {
    return buildEsPowerShellCurlOutput(documents, mode, targetIndexName, baseUrl);
  }
  return buildEsConsoleOutput(documents, mode, targetIndexName);
}


function bindEsActions() {
  resetEsOutputMeta();
  $("esMode").addEventListener("change", syncEsSelectionMeta);
  $("esOutputStyle").addEventListener("change", syncEsSelectionMeta);

  const actions = {
    convertEsData: () => {
      const input = safeJsonParse($("esInput").value);
      const mode = $("esMode").value;
      const outputStyle = $("esOutputStyle").value;
      const sourceFields = mode === "bulkDelete" ? [] : parseFieldList($("esSourceFields").value);
      const documents = normalizeEsDocuments(input, $("esIdField").value.trim(), sourceFields);
      const output = buildEsOutput(documents, mode, $("esIndexName").value.trim(), outputStyle, $("esBaseUrl").value.trim());
      setOutput("esOutput", output);
      updateEsOutputMeta(documents, output);
      showToast(
        `已生成 ${documents.length} 条记录${sourceFields.length ? `，筛选 ${sourceFields.length} 个字段` : ""}，格式：${esOutputStyleLabels[outputStyle] || "Kibana Console"
        }`
      );
    },
  };
  bindActions(actions);
}



