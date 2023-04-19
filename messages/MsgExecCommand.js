//引入基础命令类
const MsgBase = require("./MsgBase");
const process = require("child_process");

//定义Cmd执行命令类
class MsgExecCommand extends MsgBase.MsgBase {
  constructor(message, logger, win) {
    super(message, logger, win);
  }

  exec() {
    this.logger.info("执行Cmd命令:" + this.message.args);
    let cmd = this.message.args;
    let that = this;
    process.exec(cmd, {
      detached: true,
      stdio: "ignore",
    });
  }
}

exports.MsgExecCommand = MsgExecCommand;
