// time.js — 时间转换工具。
// 本文件为 site/app.js 拆分所得，采用经典脚本 + 全局作用域，与 sql-tool.js / image-tool.js 同模式。

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}


function updateCurrentTime() {
  const now = new Date();
  $("nowDisplay").textContent = formatDateTime(now);
  $("nowSeconds").textContent = String(Math.floor(now.getTime() / 1000));
  $("nowMilliseconds").textContent = String(now.getTime());
}


function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "本地时区";
}


function resetTimeConversionView() {
  setText("timeDetectedType", "等待输入");
  setText("timePrimaryLabel", "主结果");
  setText("timePrimaryValue", "-");
  setText("timeSecondaryLabel", "补充结果");
  setText("timeSecondaryValue", "-");
  setText("timeResultZone", getLocalTimeZone());
  setOutput("timeConversionOutput", "");
}


function buildTimeConversionResult(raw) {
  const input = raw.trim();
  if (!input) {
    throw new Error("请输入时间或时间戳");
  }

  const timeZone = getLocalTimeZone();
  if (/^\d{10}$/.test(input) || /^\d{13}$/.test(input)) {
    const milliseconds = input.length === 10 ? Number(input) * 1000 : Number(input);
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) {
      throw new Error("时间戳无效");
    }
    // 过滤明显超出合理范围的数字（如手机号、订单号），避免误判为时间戳
    const year = date.getUTCFullYear();
    if (year < 2000 || year > 2100) {
      throw new Error("无法识别该时间格式");
    }
    return {
      detectedType: input.length === 10 ? "秒级时间戳" : "毫秒级时间戳",
      primaryLabel: "本地时间",
      primaryValue: formatDateTime(date),
      secondaryLabel: "ISO 时间",
      secondaryValue: date.toISOString(),
      output: [
        `识别类型: ${input.length === 10 ? "秒级时间戳" : "毫秒级时间戳"}`,
        `本地时间: ${formatDateTime(date)}`,
        `秒级时间戳: ${Math.floor(milliseconds / 1000)}`,
        `毫秒级时间戳: ${milliseconds}`,
        `ISO 时间: ${date.toISOString()}`,
        `时区: ${timeZone}`,
      ].join("\n"),
    };
  }

  // 统一为 ISO（T 分隔），兼容 Safari 等不识别「空格分隔」日期的浏览器
  const normalized = input.replace(/\//g, "-").replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("无法识别该时间格式");
  }
  const milliseconds = date.getTime();
  return {
    detectedType: "日期时间",
    primaryLabel: "秒级时间戳",
    primaryValue: String(Math.floor(milliseconds / 1000)),
    secondaryLabel: "毫秒级时间戳",
    secondaryValue: String(milliseconds),
    output: [
      "识别类型: 日期时间",
      `本地时间: ${formatDateTime(date)}`,
      `秒级时间戳: ${Math.floor(milliseconds / 1000)}`,
      `毫秒级时间戳: ${milliseconds}`,
      `ISO 时间: ${date.toISOString()}`,
      `时区: ${timeZone}`,
    ].join("\n"),
  };
}


function applyTimeConversionResult(result) {
  setText("timeDetectedType", result.detectedType);
  setText("timePrimaryLabel", result.primaryLabel);
  setText("timePrimaryValue", result.primaryValue);
  setText("timeSecondaryLabel", result.secondaryLabel);
  setText("timeSecondaryValue", result.secondaryValue);
  setText("timeResultZone", getLocalTimeZone());
  setOutput("timeConversionOutput", result.output);
}


function previewTimeConversion() {
  const raw = $("timeSmartInput").value.trim();
  if (!raw) {
    resetTimeConversionView();
    return;
  }
  try {
    applyTimeConversionResult(buildTimeConversionResult(raw));
  } catch {
    setText("timeDetectedType", "等待有效输入");
    setText("timePrimaryLabel", "主结果");
    setText("timePrimaryValue", "-");
    setText("timeSecondaryLabel", "补充结果");
    setText("timeSecondaryValue", "-");
    setText("timeResultZone", getLocalTimeZone());
    setOutput("timeConversionOutput", "");
  }
}


function bindTimeActions() {
  updateCurrentTime();
  // 仅当时间面板可见时才运行每秒定时器，避免后台长期占用
  let timeTimer = null;
  const startTimeClock = () => {
    if (!timeTimer) {
      updateCurrentTime();
      timeTimer = setInterval(updateCurrentTime, 1000);
    }
  };
  const stopTimeClock = () => {
    clearInterval(timeTimer);
    timeTimer = null;
  };
  const timePanel = $("timeSection");
  if ("IntersectionObserver" in window && timePanel) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startTimeClock();
          } else {
            stopTimeClock();
          }
        });
      },
      { threshold: 0.01 }
    );
    observer.observe(timePanel);
  } else {
    startTimeClock();
  }
  resetTimeConversionView();
  $("timeSmartInput").addEventListener("input", previewTimeConversion);

  const actions = {
    smartConvertTime: () => {
      const result = buildTimeConversionResult($("timeSmartInput").value);
      applyTimeConversionResult(result);
      showToast(`已识别为${result.detectedType}`);
    },
    fillNowSeconds: () => {
      $("timeSmartInput").value = $("nowSeconds").textContent;
      previewTimeConversion();
    },
    fillNowDatetime: () => {
      $("timeSmartInput").value = $("nowDisplay").textContent;
      previewTimeConversion();
    },
    fillTimePrimaryResult: () => {
      const value = $("timePrimaryValue").textContent;
      if (!value || value === "-") {
        throw new Error("当前没有可回填的结果");
      }
      $("timeSmartInput").value = value;
      previewTimeConversion();
    },
    clearTimePanels: () => {
      $("timeSmartInput").value = "";
      resetTimeConversionView();
    },
  };
  bindActions(actions);
}

