// Desc: 命令基类
class MsgBase {
  constructor(message, logger, win) {
    this.message = message;
    this.logger = logger;
    this.win = win;
  }

  exec() {
    this.logger.info("子类未实现exec方法");
  }

  toString() {
    return "MsgBase:" + this.message;
  }
}

exports.MsgBase = MsgBase;
