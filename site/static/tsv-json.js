// tsv-json.js — 制表符分隔（TSV）表格数据转 JSON 工具。
// 与 array.js / json.js 同模式：经典脚本 + 全局作用域。

const TSV_EXAMPLE = [
  "ctrip_id\tpl_id\thuoli_id\tarea\tbase_city_code\tbase_city_name\tname\tcontact_phone\tgps_lag\tgps_log\taddress\tmode_api\tapi_price_date\tapi_price_update\tapi_price\tmode_h5\th5_price_date\th5_price_update\th5_price\tstatus\tcreate_time\tupdate_time",
  "100002491\tpl_279642533\t\t1\t21053\t沿河\t江城公寓\t86--18848517298\t28.53816\t108.482239\t和平街道崔家村桂花路24号\t1\t2026-08-13\t2026-08-11 18:19:00\t45.00\t1\t2026-08-11\t2026-08-11 18:19:00\t45.00\t0\t2026-08-11 18:19:00\t2026-08-26 10:50:23",
].join("\n");


function parseTsvRows(text) {
  return String(text)
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.split("\t"))
    .filter((cells) => cells.some((cell) => cell.trim() !== ""));
}


function coerceTsvValue(cell, emptyAsNull, inferTypes) {
  const raw = cell == null ? "" : String(cell);
  if (raw === "") {
    return emptyAsNull ? null : "";
  }
  if (inferTypes) {
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw.toLowerCase() === "null") return null;
    if (/^-?[0-9]+(\.[0-9]+)?$/.test(raw)) {
      const num = Number(raw);
      if (Number.isFinite(num)) return num;
    }
  }
  return raw;
}

function tsvToObjects(text, options = {}) {
  const emptyAsNull = !!options.emptyAsNull;
  const inferTypes = !!options.inferTypes;
  const rows = parseTsvRows(text);
  if (rows.length < 2) {
    throw new Error("至少需要表头行和一行数据");
  }
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header === "") {
        return;
      }
      obj[header] = coerceTsvValue(cells[index], emptyAsNull, inferTypes);
    });
    return obj;
  });
}


function tsvToJson(text, options = {}) {
  return JSON.stringify(tsvToObjects(text, options), null, 2);
}


function runTsvConversion() {
  const options = {
    emptyAsNull: $("tsvEmptyAsNull").value === "null",
    inferTypes: $("tsvInferTypes").value === "smart",
  };
  const objects = tsvToObjects($("tsvInput").value, options);
  setOutput("tsvOutput", JSON.stringify(objects, null, 2));
  setText("tsvRowCount", objects.length);
  setText("tsvColCount", objects.length ? Object.keys(objects[0]).length : 0);
  showToast(`已转换 ${objects.length} 条记录`);
}


function bindTsvJsonActions() {
  const syncMeta = () => {
    try {
      const rows = parseTsvRows($("tsvInput").value);
      setText("tsvRowCount", Math.max(0, rows.length - 1));
      setText("tsvColCount", rows.length ? rows[0].length : 0);
    } catch (_) {
      setText("tsvRowCount", 0);
      setText("tsvColCount", 0);
    }
  };

  $("tsvInput").addEventListener("input", syncMeta);
  $("tsvEmptyAsNull").addEventListener("change", () => {
    if ($("tsvInput").value.trim()) runTsvConversion();
  });
  $("tsvInferTypes").addEventListener("change", () => {
    if ($("tsvInput").value.trim()) runTsvConversion();
  });

  const actions = {
    convertTsv: () => runTsvConversion(),
    fillTsvExample: () => {
      setOutput("tsvInput", TSV_EXAMPLE);
      syncMeta();
      runTsvConversion();
      $("tsvInput").focus();
    },
    clearTsv: () => {
      setOutput("tsvInput", "");
      setOutput("tsvOutput", "");
      setText("tsvRowCount", 0);
      setText("tsvColCount", 0);
    },
  };
  bindActions(actions);
}