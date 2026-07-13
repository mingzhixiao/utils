/* SQL 工具相关功能：SQL 压缩 + 根据 CREATE TABLE 生成 Java 对象 */
/* 依赖全局函数（定义在 core.js）：$、setText、setOutput、showToast、bindActions */

const sqlExamples = {
  SELECT: `SELECT u.id, u.name, u.email
FROM users u
WHERE u.status = 'active'
  AND u.created_at > '2024-01-01'
ORDER BY u.name ASC
LIMIT 100;`,
  INSERT: `INSERT INTO orders (user_id, product_id, quantity, price)
VALUES
  (101, 5001, 2, 29.99),
  (102, 5003, 1, 49.99),
  (103, 5007, 5, 9.99);`,
  COMPLEX: `SELECT
  FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(create_time) / 600) * 600) AS 十分钟区间,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS 成功数,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS 失败数,
  COUNT(*) AS 总数,
  CONCAT(ROUND(SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 1), '%') AS 失败率
FROM baidu_check_price_log
WHERE create_time >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
GROUP BY FLOOR(UNIX_TIMESTAMP(create_time) / 600)
ORDER BY 十分钟区间
LIMIT 100;`,
  JAVA: `CREATE TABLE \`user_info\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  \`user_name\` VARCHAR(64) NOT NULL COMMENT '用户名',
  \`age\` INT DEFAULT NULL COMMENT '年龄',
  \`balance\` DECIMAL(10,2) DEFAULT NULL COMMENT '余额',
  \`status\` TINYINT DEFAULT 0 COMMENT '状态',
  \`create_time\` DATETIME DEFAULT NULL COMMENT '创建时间',
  \`update_time\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COMMENT='用户信息';`,
};

function toCamelCase(name) {
  return name
    .toLowerCase()
    .replace(/[_-\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toLowerCase());
}

function toPascalCase(name) {
  const camel = toCamelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts;
}

function parseColumnDef(segment) {
  const nameMatch = segment.match(/^\s*[`"]?([a-zA-Z_][a-zA-Z0-9_]*)['"`]?\s+/);
  if (!nameMatch) {
    return null;
  }
  const name = nameMatch[1];
  const rest = segment.slice(nameMatch[0].length);
  // 仅取首个单词作为类型（避免把紧随其后的 NOT / DEFAULT 等关键字吞入类型名）
  const typeMatch = rest.match(/^([a-zA-Z]+)(\s*\([^)]*\))?/i);
  let type = "VARCHAR";
  if (typeMatch) {
    type = typeMatch[1].toUpperCase();
    // 处理多词类型，如 DOUBLE PRECISION
    const after = rest.slice(typeMatch[0].length);
    if (type === "DOUBLE" && /^\s+PRECISION\b/i.test(after)) {
      type = "DOUBLE PRECISION";
    }
  }
  const commentMatch = segment.match(/COMMENT\s+(['"`])([\s\S]*?)\1/i);
  const comment = commentMatch ? commentMatch[2] : "";
  const notNull = /\bNOT\s+NULL\b/i.test(segment);
  const autoIncrement = /\bAUTO_INCREMENT\b/i.test(segment);
  return { name, type, comment, notNull, autoIncrement };
}

function parseCreateTable(sql) {
  const result = { tableName: "", columns: [], primaryKeys: [] };
  if (!sql || !sql.trim()) {
    return result;
  }
  const tableMatch = sql.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z_][a-zA-Z0-9_]*)['"`]?/i
  );
  if (tableMatch) {
    result.tableName = tableMatch[1];
  }
  const openIdx = sql.indexOf("(", tableMatch ? tableMatch.index : 0);
  if (openIdx === -1) {
    return result;
  }
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < sql.length; i++) {
    if (sql[i] === "(") {
      depth++;
    } else if (sql[i] === ")") {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1) {
    return result;
  }
  const body = sql.slice(openIdx + 1, closeIdx);
  const constraintRe = /^\s*(PRIMARY\s+KEY|UNIQUE(\s+KEY)?|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY|FULLTEXT|SPATIAL|CHECK)\b/i;
  splitTopLevel(body, ",").forEach((raw) => {
    const seg = raw.trim();
    if (!seg) {
      return;
    }
    if (constraintRe.test(seg)) {
      const pk = seg.match(/PRIMARY\s+KEY\s*\(([^)]*)\)/i);
      if (pk) {
        pk[1].split(",").forEach((col) => {
          const colName = col.trim().replace(/^[`"]|[`"]$/g, "");
          if (colName) {
            result.primaryKeys.push(colName);
          }
        });
      }
      return;
    }
    const col = parseColumnDef(seg);
    if (col) {
      result.columns.push(col);
    }
  });
  return result;
}

function sqlTypeToJava(type, typeStrategy, dateType) {
  const t = type.toUpperCase();
  const wrapper = typeStrategy !== "primitive";
  switch (t) {
    case "TINYINT":
    case "SMALLINT":
    case "MEDIUMINT":
    case "INT":
    case "INTEGER":
      return wrapper ? "Integer" : "int";
    case "BIGINT":
      return wrapper ? "Long" : "long";
    case "FLOAT":
    case "REAL":
      return wrapper ? "Float" : "float";
    case "DOUBLE":
    case "DOUBLE PRECISION":
      return wrapper ? "Double" : "double";
    case "DECIMAL":
    case "NUMERIC":
    case "NUMBER":
      return "BigDecimal";
    case "BIT":
    case "BOOLEAN":
    case "BOOL":
      return wrapper ? "Boolean" : "boolean";
    case "CHAR":
    case "NCHAR":
    case "VARCHAR":
    case "NVARCHAR":
    case "VARCHAR2":
    case "TEXT":
    case "TINYTEXT":
    case "MEDIUMTEXT":
    case "LONGTEXT":
    case "CLOB":
    case "ENUM":
    case "SET":
    case "JSON":
    case "UUID":
      return "String";
    case "DATE":
      return dateType === "sql" ? "java.sql.Date" : "LocalDate";
    case "DATETIME":
    case "TIMESTAMP":
      return dateType === "sql" ? "Date" : "LocalDateTime";
    case "TIME":
      return dateType === "sql" ? "java.sql.Time" : "LocalTime";
    case "BLOB":
    case "LONGBLOB":
    case "MEDIUMBLOB":
    case "BINARY":
    case "VARBINARY":
    case "BYTEA":
      return "byte[]";
    default:
      return "String";
  }
}

function buildJavaClass(parsed, options) {
  const { className, packageName, fieldStyle, typeStrategy, dateType, style } = options;
  const classRaw = (className && className.trim()) || toPascalCase(parsed.tableName) || "GeneratedEntity";
  const out = [];
  if (packageName && packageName.trim()) {
    out.push(`package ${packageName.trim()};`, "");
  }

  const columns = parsed.columns.map((c) => {
    const javaType = sqlTypeToJava(c.type, typeStrategy, dateType);
    const fieldName = fieldStyle === "camel" ? toCamelCase(c.name) : c.name;
    return { ...c, javaType, fieldName };
  });

  // java.sql.Date / java.sql.Time 保持全限定名避免与 java.util.Date 冲突，
  // 其余类型统一 import
  const usedTypes = new Set(columns.map((c) => c.javaType));
  const imports = [];
  if (style === "lombok") {
    imports.push("import lombok.Data;");
  }
  if (usedTypes.has("BigDecimal")) imports.push("import java.math.BigDecimal;");
  if (usedTypes.has("Date")) imports.push("import java.util.Date;");
  if (usedTypes.has("LocalDate")) imports.push("import java.time.LocalDate;");
  if (usedTypes.has("LocalDateTime")) imports.push("import java.time.LocalDateTime;");
  if (usedTypes.has("LocalTime")) imports.push("import java.time.LocalTime;");
  if (imports.length) {
    out.push(imports.join("\n"), "");
  }

  const classAnnotation = style === "lombok" ? "@Data\n" : "";
  out.push(`${classAnnotation}public class ${classRaw} {`);
  out.push("");

  columns.forEach((c) => {
    if (c.comment) {
      out.push(`    /** ${c.comment} */`);
    }
    out.push(`    private ${c.javaType} ${c.fieldName};`);
    out.push("");
  });

  if (style === "getterSetter") {
    columns.forEach((c) => {
      const cap = c.fieldName.charAt(0).toUpperCase() + c.fieldName.slice(1);
      out.push(`    public ${c.javaType} get${cap}() {`);
      out.push(`        return ${c.fieldName};`);
      out.push(`    }`);
      out.push("");
      out.push(`    public void set${cap}(${c.javaType} ${c.fieldName}) {`);
      out.push(`        this.${c.fieldName} = ${c.fieldName};`);
      out.push(`    }`);
      out.push("");
    });
  }

  out.push(`}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd() + "\n";
}

function runGenerateJava() {
  const sql = $("sqlJavaInput").value;
  if (!sql.trim()) {
    showToast("请粘贴 CREATE TABLE 语句", true);
    return;
  }
  const parsed = parseCreateTable(sql);
  if (!parsed.columns.length) {
    showToast("未能解析出字段，请检查 SQL 格式", true);
    setOutput("sqlJavaOutput", "");
    setText("sqlJavaInputBadge", "0 字段");
    setText("sqlJavaFieldCount", "0");
    setText("sqlJavaClassNameOut", "-");
    return;
  }
  const options = {
    className: $("sqlJavaClassName").value,
    packageName: $("sqlJavaPackage").value,
    fieldStyle: $("sqlJavaFieldStyle").value,
    typeStrategy: $("sqlJavaTypeStrategy").value,
    dateType: $("sqlJavaDateType").value,
    style: $("sqlJavaStyle").value,
  };
  const javaCode = buildJavaClass(parsed, options);
  setOutput("sqlJavaOutput", javaCode);
  const classRaw = (options.className && options.className.trim()) || toPascalCase(parsed.tableName) || "GeneratedEntity";
  setText("sqlJavaInputBadge", `${parsed.columns.length} 字段`);
  setText("sqlJavaFieldCount", String(parsed.columns.length));
  setText("sqlJavaClassNameOut", classRaw);
  const styleLabels = { lombok: "Lombok", getterSetter: "Getter/Setter", fields: "仅字段" };
  setText("sqlJavaStyleOut", styleLabels[options.style] || "Lombok");
  showToast(`已生成 ${parsed.columns.length} 个字段`);
}

function compressSql(sql) {
  if (!sql || sql.trim() === "") {
    return "";
  }
  let result = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n\r]*/g, "")
    .replace(/[\r\n\t\f\v]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
  result = result.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+\(/g, "$1(");
  result = result.replace(/\s*,\s*/g, ", ");
  result = result.replace(/\s*\)\s*/g, ") ");
  result = result.replace(/ +/g, " ").trim();
  return result;
}

function updateSqlInputMeta(input) {
  setText("sqlInputCharCount", `${input.length} 字符`);
}

function updateSqlOutputMeta(input, output) {
  const inLen = input.length;
  const outLen = output.length;
  setText("sqlOutputCharCount", `${outLen} 字符`);
  setText("sqlLineCountBefore", input === "" ? 0 : input.split("\n").length);
  setText("sqlLineCountAfter", output === "" ? 0 : output.split("\n").length);
  if (inLen > 0 && outLen > 0) {
    const ratio = (((inLen - outLen) / inLen) * 100).toFixed(1);
    setText("sqlCompressRatio", `${ratio}%`);
    return;
  }
  setText("sqlCompressRatio", "-");
}

function runSqlCompress() {
  const input = $("sqlInput").value;
  const output = compressSql(input);
  setOutput("sqlOutput", output);
  updateSqlInputMeta(input);
  updateSqlOutputMeta(input, output);
  if (output) {
    showToast("SQL 已压缩");
  }
}

function bindSqlActions() {
  updateSqlInputMeta("");
  updateSqlOutputMeta("", "");

  $("sqlInput").addEventListener("input", (event) => {
    updateSqlInputMeta(event.target.value);
  });
  $("sqlInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runSqlCompress();
    }
  });

  const actions = {
    compressSql: () => runSqlCompress(),
    clearSqlPanels: () => {
      $("sqlInput").value = "";
      $("sqlOutput").value = "";
      updateSqlInputMeta("");
      updateSqlOutputMeta("", "");
      $("sqlInput").focus();
    },
    fillSqlExampleSelect: () => {
      $("sqlInput").value = sqlExamples.SELECT;
      runSqlCompress();
    },
    fillSqlExampleInsert: () => {
      $("sqlInput").value = sqlExamples.INSERT;
      runSqlCompress();
    },
    fillSqlExampleComplex: () => {
      $("sqlInput").value = sqlExamples.COMPLEX;
      runSqlCompress();
    },
    generateJavaFromSql: () => runGenerateJava(),
    fillSqlExampleJava: () => {
      $("sqlJavaInput").value = sqlExamples.JAVA;
      runGenerateJava();
    },
    clearSqlJavaPanels: () => {
      $("sqlJavaInput").value = "";
      $("sqlJavaOutput").value = "";
      $("sqlJavaClassName").value = "";
      $("sqlJavaPackage").value = "";
      setText("sqlJavaInputBadge", "0 字段");
      setText("sqlJavaFieldCount", "0");
      setText("sqlJavaClassNameOut", "-");
      $("sqlJavaInput").focus();
    },
  };
  bindActions(actions);

  ["sqlJavaClassName", "sqlJavaPackage", "sqlJavaFieldStyle", "sqlJavaTypeStrategy", "sqlJavaDateType", "sqlJavaStyle"].forEach(
    (id) => {
      const el = $(id);
      if (!el) {
        return;
      }
      el.addEventListener("input", () => {
        if ($("sqlJavaInput").value.trim()) {
          runGenerateJava();
        }
      });
      el.addEventListener("change", () => {
        if ($("sqlJavaInput").value.trim()) {
          runGenerateJava();
        }
      });
    }
  );
}
