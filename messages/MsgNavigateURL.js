//引入基础命令类
const MsgBase = require("./MsgBase");

//定义导航命令类
class MsgNavigateURL extends MsgBase.MsgBase {
  constructor(message, logger, win) {
    super(message, logger, win);
  }

  exec() {
    this.logger.info("执行导航命令:" + this.message.args);
    if (this.win.webContents.getURL() != this.message.args) {
      this.logger.info("当前页面不是: " + this.message.args + ", 开始跳转");
      this.win.loadURL(this.message.args);
    } else {
      this.logger.info("当前页面已经是: " + this.message.args);
    }
  }
}

exports.MsgNavigateURL = MsgNavigateURL;
