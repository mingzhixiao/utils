# Dev Toolbox Pro

一个免构建的浏览器扩展工具箱，包含：

- 编码工具：URL、Unicode、Base64 编码解码
- JSON 工具：格式化、压缩、转义、去除转义、树视图、JSON/CSV 互转、复制、双 JSON 差异对比
- 时间工具：当前秒/毫秒时间戳、时间戳与时间互转
- 图片工具：按百分比压缩、批量提取文本中的图片地址并对比查看，支持列数/缩放联动和失败高亮
- ES 工具：将 Elasticsearch 查询结果转换成 Index API、Update API、Bulk Index、Bulk Update、Bulk Delete 语句，可修改索引名、筛选导出字段，并导出 Kibana Console 或 cURL 格式

## 使用方式

1. 打开 Chrome 或 Edge 扩展管理页。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择当前目录 `G:\workspace2\login33\utils`。
5. 点击扩展图标时会默认以整页方式打开工具台。

## 文件说明

- `manifest.json`：扩展清单
- `popup.html`：主界面
- `styles.css`：样式
- `app.js`：全部工具逻辑
