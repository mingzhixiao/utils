// 主题初始化：在样式应用前尽早设置 data-theme，避免闪烁
(function () {
  const savedTheme = localStorage.getItem("dev-toolbox-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
})();
