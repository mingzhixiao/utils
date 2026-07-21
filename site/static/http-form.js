// http-form.js — HTTP 表单转 cURL 工具。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

const httpFormOutputStyleLabels = {
  curl: "cURL (bash)",
  curlPowerShell: "cURL (PowerShell)",
};


const httpInputModeLabels = {
  json: "JSON 请求体",
  getUrl: "GET URL",
};


const httpBodyFormatLabels = {
  form: "Form 表单",
  json: "JSON",
};


const httpFormExample = {
  url: "https://api.example.com/hotel/search",
  getUrl:
    "https://api.example.com/hotel/search?st=1&cityid=2102&key=明都&startdate=2026-07-06&enddate=2026-07-08&p=appstore,ios14.4,kssl,7.8.3,iPhone14.4,0&phoneid=155249246&pn=25&ps=0&shortcut=%5B%7B%22type%22%3A%2219%22%2C%22id%22%3A%5B%22agreementPrice%22%5D%7D%5D&stf=usscore&t=1&tmc=1",
  json: JSON.stringify(
    {
      st: "1",
      cityid: "2102",
      key: "明都",
      startdate: "2026-07-06",
      enddate: "2026-07-08",
      p: "appstore,ios14.4,kssl,7.8.3,iPhone14.4,0",
      phoneid: "155249246",
      pn: "25",
      ps: "0",
      shortcut: '[{"type":"19","id":["agreementPrice"]}]',
      stf: "usscore",
      t: "1",
      tmc: "1",
    },
    null,
    2
  ),
};


function buildFormFieldKey(parentKey, key, keyStyle) {
  if (!parentKey) {
    return String(key);
  }
  if (keyStyle === "dot") {
    return `${parentKey}.${key}`;
  }
  return `${parentKey}[${key}]`;
}


function flattenJsonToFormFields(value, parentKey = "", keyStyle = "bracket", result = []) {
  if (value === null || value === undefined) {
    if (parentKey) {
      result.push([parentKey, ""]);
    }
    return result;
  }

  if (Array.isArray(value)) {
    if (value.length === 0 && parentKey) {
      result.push([parentKey, ""]);
      return result;
    }
    value.forEach((item, index) => {
      flattenJsonToFormFields(item, buildFormFieldKey(parentKey, index, keyStyle), keyStyle, result);
    });
    return result;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0 && parentKey) {
      result.push([parentKey, ""]);
      return result;
    }
    entries.forEach(([key, nestedValue]) => {
      flattenJsonToFormFields(nestedValue, buildFormFieldKey(parentKey, key, keyStyle), keyStyle, result);
    });
    return result;
  }

  result.push([parentKey, String(value)]);
  return result;
}


function buildFormBody(fields) {
  return fields.map(([key, value]) => `${key}=${value}`).join("&");
}


function tryParseJsonValue(value) {
  const text = String(value).trim();
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return value;
    }
  }
  return value;
}


function queryParamsToObject(params, parseJsonValues = false) {
  const result = {};
  Object.entries(params).forEach(([key, value]) => {
    const mapValue = (item) => (parseJsonValues ? tryParseJsonValue(item) : item);
    if (Array.isArray(value)) {
      result[key] = value.map(mapValue);
      return;
    }
    result[key] = mapValue(value);
  });
  return result;
}


function parseGetUrl(input, requireParams = true) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入 GET 请求 URL");
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let urlObject;
  try {
    urlObject = new URL(normalized);
  } catch (error) {
    throw new Error("URL 格式无效");
  }

  const params = {};
  urlObject.searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      if (Array.isArray(params[key])) {
        params[key].push(value);
        return;
      }
      params[key] = [params[key], value];
      return;
    }
    params[key] = value;
  });

  if (requireParams && Object.keys(params).length === 0) {
    throw new Error("GET URL 中未找到查询参数");
  }

  return {
    baseUrl: `${urlObject.origin}${urlObject.pathname}`,
    params,
  };
}


function extractBaseHttpUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入请求 URL");
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const urlObject = new URL(normalized);
    return `${urlObject.origin}${urlObject.pathname}`;
  } catch (error) {
    throw new Error("URL 格式无效");
  }
}


function dataObjectToQueryFields(dataObject, bodyFormat, keyStyle) {
  if (bodyFormat === "form") {
    return flattenJsonToFormFields(dataObject, "", keyStyle);
  }

  return Object.entries(dataObject).map(([key, value]) => {
    if (value === null || value === undefined) {
      return [key, ""];
    }
    if (typeof value === "object") {
      return [key, JSON.stringify(value)];
    }
    return [key, String(value)];
  });
}


function buildQueryString(fields) {
  return buildFormBody(fields);
}


function buildUrlWithQuery(baseUrl, queryString) {
  if (!queryString) {
    return baseUrl;
  }
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${queryString}`;
}


function buildGetCurlRequest(url, outputStyle = "curl") {
  if (outputStyle === "curlPowerShell") {
    return `curl.exe "${url}"`;
  }
  return `curl "${url}"`;
}


function buildJsonCurlRequest(method, url, jsonBody, outputStyle = "curl") {
  if (outputStyle === "curlPowerShell") {
    return buildPowerShellCurlRequest(method, url, jsonBody, "application/json");
  }
  return buildCurlRequest(method, url, jsonBody, "application/json");
}


function buildFormCurlRequest(method, url, formBody, outputStyle = "curl") {
  const contentType = "application/x-www-form-urlencoded";
  if (outputStyle === "curlPowerShell") {
    if (!formBody) {
      return `curl.exe -X ${method} "${url}"`;
    }
    return [
      "@'",
      formBody,
      `'@ | curl.exe -X ${method} "${url}" \``,
      `  -H "Content-Type: ${contentType}" \``,
      "  --data-binary @-",
    ].join("\n");
  }

  if (!formBody) {
    return `curl -X ${method} "${url}"`;
  }

  const bashSafeBody = escapeBashSingleQuotes(formBody);
  return [
    `curl -X ${method} "${url}" \\`,
    `  -H "Content-Type: ${contentType}" \\`,
    `  --data '${bashSafeBody}'`,
  ].join("\n");
}


function syncHttpFormMeta(fieldCount) {
  setText("httpFormFieldCount", fieldCount);
  setText("httpOutputMethodLabel", $("httpOutputMethod").value || "POST");
  setText("httpInputModeLabel", httpInputModeLabels[$("httpInputMode").value] || "JSON 请求体");
  setText("httpBodyFormatLabel", httpBodyFormatLabels[$("httpBodyFormat").value] || "Form 表单");
  setText(
    "httpFormFormatLabel",
    httpFormOutputStyleLabels[$("httpFormOutputStyle").value] || "cURL (bash)"
  );
}


function syncHttpInputModeUi() {
  const inputMode = $("httpInputMode").value;
  const bodyFormat = $("httpBodyFormat").value;
  const outputMethod = $("httpOutputMethod").value;
  const isGetUrlMode = inputMode === "getUrl";
  const isGetOutput = outputMethod === "GET";
  const showKeyStyle = bodyFormat === "form" && inputMode === "json";

  $("httpFormJsonGroup").classList.toggle("hidden-field", isGetUrlMode);
  $("httpFormKeyStyleGroup").classList.toggle("hidden-field", !showKeyStyle);
  setText("httpFormUrlLabel", isGetUrlMode ? "GET 请求 URL" : "请求 URL");
  $("httpFormUrl").placeholder = isGetUrlMode
    ? "https://example.com/api/search?cityid=2102&key=明都"
    : "https://example.com/api/submit";
  setText("httpBodyFormatLabelText", isGetUrlMode ? "参数值解析" : "请求体格式");
  $("httpBodyFormatHint").style.display = isGetUrlMode ? "" : "none";

  const hint = $("httpInputModeHint");
  if (isGetUrlMode && isGetOutput) {
    hint.textContent = "GET 输入 + GET 输出：会解析并重新整理查询参数，可按 Form / JSON 格式输出。";
    return;
  }
  if (isGetUrlMode) {
    hint.textContent = "GET 输入 + POST 输出：解析 URL 查询参数，去掉 query 后作为 POST 地址。";
    return;
  }
  if (isGetOutput && bodyFormat === "json") {
    hint.textContent = "JSON 输入 + GET 输出：对象/数组字段会序列化为 JSON 字符串放入 query。";
    return;
  }
  if (isGetOutput) {
    hint.textContent = "JSON 输入 + GET 输出：按嵌套结构扁平化为 query 参数，如 tags[0]=a。";
    return;
  }
  if (bodyFormat === "json") {
    hint.textContent = "JSON 输入 + POST 输出：请求体以 application/json 发送。";
    return;
  }
  hint.textContent = "JSON 输入 + POST 输出：按嵌套结构扁平化为 Form 表单字段。";
}


function resetHttpFormMeta() {
  syncHttpFormMeta(0);
  syncHttpInputModeUi();
}


function runHttpFormCurlConversion() {
  const inputMode = $("httpInputMode").value;
  const bodyFormat = $("httpBodyFormat").value;
  const keyStyle = $("httpFormKeyStyle").value;
  const outputMethod = $("httpOutputMethod").value || "POST";
  const outputStyle = $("httpFormOutputStyle").value;
  const isGetOutput = outputMethod === "GET";

  let baseUrl;
  let dataObject;

  if (inputMode === "getUrl") {
    const parsed = parseGetUrl($("httpFormUrl").value);
    baseUrl = parsed.baseUrl;
    dataObject = queryParamsToObject(parsed.params, bodyFormat === "json");
  } else {
    baseUrl = extractBaseHttpUrl($("httpFormUrl").value);

    const jsonInput = $("httpFormJsonInput").value.trim();
    if (!jsonInput) {
      throw new Error("请输入 JSON 请求体");
    }

    const parsed = safeJsonParse(jsonInput);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("请求体必须是 JSON 对象");
    }
    dataObject = parsed;
  }

  const queryFields = dataObjectToQueryFields(dataObject, bodyFormat, keyStyle);
  if (queryFields.length === 0) {
    throw new Error("无可用参数");
  }

  let bodyPreview;
  let output;

  if (isGetOutput) {
    const queryString = buildQueryString(queryFields);
    const fullUrl = buildUrlWithQuery(baseUrl, queryString);
    bodyPreview = queryString;
    output = buildGetCurlRequest(fullUrl, outputStyle);
  } else if (bodyFormat === "json") {
    bodyPreview = JSON.stringify(dataObject, null, 2);
    output = buildJsonCurlRequest(outputMethod, baseUrl, bodyPreview, outputStyle);
  } else {
    bodyPreview = buildQueryString(queryFields);
    output = buildFormCurlRequest(outputMethod, baseUrl, bodyPreview, outputStyle);
  }

  const fieldCount = queryFields.length;
  setOutput("httpFormBodyPreview", bodyPreview);
  setOutput("httpFormOutput", output);
  syncHttpFormMeta(fieldCount);
  showToast(
    `已生成 ${fieldCount} 个参数的 ${outputMethod} ${httpBodyFormatLabels[bodyFormat] || "Form 表单"} cURL 命令`
  );
}


function bindHttpFormActions() {
  resetHttpFormMeta();
  $("httpInputMode").addEventListener("change", () => {
    syncHttpInputModeUi();
    syncHttpFormMeta($("httpFormFieldCount").textContent || 0);
  });
  $("httpBodyFormat").addEventListener("change", () => {
    syncHttpInputModeUi();
    syncHttpFormMeta($("httpFormFieldCount").textContent || 0);
  });
  $("httpOutputMethod").addEventListener("change", () => {
    syncHttpInputModeUi();
    syncHttpFormMeta($("httpFormFieldCount").textContent || 0);
  });
  $("httpFormOutputStyle").addEventListener("change", () => syncHttpFormMeta($("httpFormFieldCount").textContent || 0));

  const actions = {
    convertHttpFormCurl: () => runHttpFormCurlConversion(),
    fillHttpFormExample: () => {
      const inputMode = $("httpInputMode").value;
      $("httpOutputMethod").value = inputMode === "getUrl" ? "GET" : "POST";
      $("httpFormOutputStyle").value = "curl";
      $("httpFormKeyStyle").value = "bracket";

      if (inputMode === "getUrl") {
        $("httpFormUrl").value = httpFormExample.getUrl;
        $("httpFormJsonInput").value = "";
      } else {
        $("httpFormUrl").value = httpFormExample.url;
        $("httpFormJsonInput").value = httpFormExample.json;
      }

      syncHttpInputModeUi();
      runHttpFormCurlConversion();
    },
    clearHttpFormPanels: () => {
      $("httpFormUrl").value = "";
      $("httpFormJsonInput").value = "";
      $("httpInputMode").value = "json";
      $("httpBodyFormat").value = "form";
      $("httpOutputMethod").value = "POST";
      setOutput("httpFormBodyPreview", "");
      setOutput("httpFormOutput", "");
      resetHttpFormMeta();
      showToast("已清空");
    },
  };
  bindActions(actions);
}



