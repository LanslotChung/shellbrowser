const fs = require("fs");
const log4js = require("log4js");

function checkPath(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
    console.log("create path: " + path);
  }
}

log4js.configure({
  appenders: {
    console: { type: "console" },
    file: {
      type: "dateFile",
      filename: "logs/shellbrowser.log",
      pattern: "-yyyy-MM-dd",
      keepFileExt: true,
      alwaysIncludePattern: true,
    },
  },
  categories: {
    default: { appenders: ["console"], level: "info" },
    myapp: { appenders: ["console", "file"], level: "info" },
  },
});

exports.logger = function (name) {
  return log4js.getLogger(name);
};
