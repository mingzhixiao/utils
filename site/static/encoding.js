// encoding.js — 编码/解码工具（Unicode 转义、Base64 等）。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

const textEncoder = new TextEncoder();

const textDecoder = new TextDecoder();

function toUnicodeEscape(input) {
  return Array.from(input)
    .map((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint <= 0xffff) {
        return `\\u${codePoint.toString(16).padStart(4, "0")}`;
      }
      const surrogate = codePoint - 0x10000;
      const high = 0xd800 + (surrogate >> 10);
      const low = 0xdc00 + (surrogate & 0x3ff);
      return `\\u${high.toString(16)}\\u${low.toString(16)}`;
    })
    .join("");
}


function fromUnicodeEscape(input) {
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}


function encodeBase64Utf8(input) {
  const bytes = textEncoder.encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}


function decodeBase64Utf8(input) {
  const binary = atob(input.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return textDecoder.decode(bytes);
}


const encodingModes = {
  url: {
    badge: "URL",
    name: "URL 编码 / 解码",
    hint: "适合处理 query 参数、回调地址和浏览器地址栏内容。",
    placeholder: "输入 URL 参数、路径或普通文本",
    encodeLabel: "编码",
    decodeLabel: "解码",
    encodeResultLabel: "原文 → 编码",
    decodeResultLabel: "编码 → 原文",
    encode: (value) => encodeURIComponent(value),
    decode: (value) => decodeURIComponent(value),
  },
  unicode: {
    badge: "Unicode",
    name: "Unicode 编码 / 解码",
    hint: "适合处理带 \\uXXXX 的转义文本和中文字符互转。",
    placeholder: "输入中文，或 \\u4f60\\u597d 这样的文本",
    encodeLabel: "编码",
    decodeLabel: "解码",
    encodeResultLabel: "原文 → 编码",
    decodeResultLabel: "编码 → 原文",
    encode: (value) => toUnicodeEscape(value),
    decode: (value) => fromUnicodeEscape(value),
  },
  base64: {
    badge: "Base64",
    name: "Base64 编码 / 解码",
    hint: "适合处理接口传输文本、调试 token 片段和简单文本封装。",
    placeholder: "输入任意 UTF-8 文本或 Base64 内容",
    encodeLabel: "编码",
    decodeLabel: "解码",
    encodeResultLabel: "原文 → 编码",
    decodeResultLabel: "编码 → 原文",
    encode: (value) => encodeBase64Utf8(value),
    decode: (value) => decodeBase64Utf8(value),
  },
  escape: {
    badge: "Escape",
    name: "字符串转义 / 去除转义",
    hint: "适合把普通文本转成可嵌入 JSON 或代码字符串的转义文本，也可反向还原。",
    placeholder: "输入普通文本，或带 \\n、\\t、\\\" 的转义字符串",
    encodeLabel: "转义",
    decodeLabel: "去除转义",
    encodeResultLabel: "原文 → 转义文本",
    decodeResultLabel: "转义文本 → 原文",
    encode: (value) => jsonEscapeString(value),
    decode: (value) => jsonUnescapeString(value),
  },
};


function updateEncodingUi() {
  const mode = encodingModes[state.encodingType];
  document.querySelectorAll("[data-encoding-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.encodingType === state.encodingType);
  });
  setText("encodingActiveBadge", mode.badge);
  setText("encodingModeHint", mode.hint);
  $("encodingInput").placeholder = mode.placeholder;
  setText("encodingEncodeBtn", mode.encodeLabel);
  setText("encodingDecodeBtn", mode.decodeLabel);
}


function updateEncodingOutputMeta(result, directionLabel) {
  setText("encodingLastAction", directionLabel);
  setText("encodingOutputLength", result.length);
  const inLen = $("encodingInput").value.length;
  setText("encodingCharDelta", `${inLen} → ${result.length}`);
}


function runEncodingTransform(direction) {
  const mode = encodingModes[state.encodingType];
  const input = $("encodingInput").value;
  const result = direction === "encode" ? mode.encode(input) : mode.decode(input);
  setOutput("encodingOutput", result);
  updateEncodingOutputMeta(result, direction === "encode" ? mode.encodeResultLabel : mode.decodeResultLabel);
}


function bindEncodingActions() {
  updateEncodingUi();
  updateEncodingOutputMeta("", "等待操作");
  document.querySelectorAll("[data-encoding-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.encodingType = button.dataset.encodingType;
      updateEncodingUi();
    });
  });

  const actions = {
    runEncodingEncode: () => runEncodingTransform("encode"),
    runEncodingDecode: () => runEncodingTransform("decode"),
    fillEncodingResult: () => {
      $("encodingInput").value = $("encodingOutput").value;
    },
    clearEncodingPanels: () => {
      $("encodingInput").value = "";
      $("encodingOutput").value = "";
      updateEncodingOutputMeta("", "等待操作");
    },
  };
  bindActions(actions);
}

