const { app, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const path = require("path");
const util = require("util");
const myutils = require("./utils/myutils");
const log4js = require("./utils/logger");
const { stringify } = require("querystring");
const logger = log4js.logger("myapp");

///Cmd
const MsgNavigateURL = require("./messages/MsgNavigateURL").MsgNavigateURL;
const MsgExecCommand = require("./messages/MsgExecCommand").MsgExecCommand;
///End Cmd

let config;
let win;
let tray;
let trayMenu = [
  { label: "还原", type: "normal", click: () => win.show() },
  {
    label: "开机自启动",
    type: "checkbox",
    checked: app.getLoginItemSettings().openAtLogin,
    click: () => {
      app.setLoginItemSettings({
        openAtLogin: !app.getLoginItemSettings().openAtLogin,
      });
      logger.info("开机自启动设置为: " + app.getLoginItemSettings().openAtLogin);
    },
  },
  { label: "最小化到托盘", type: "normal", click: () => win.hide() },
  {
    label: "退出",
    type: "normal",
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  },
];

const createWindow = () => {
  try {
    logger.info("开始创建窗口");
    if (config.browser.visible) {
      logger.info("窗口可见");
    } else {
      logger.info("窗口不可见");
    }
    win = new BrowserWindow({
      fullscreen: config.browser.fullscreen,
      width: config.browser.width,
      height: config.browser.height,
      webPreferences: {
        nodeIntegration: true,
      },
      title: "My App",
      autoHideMenuBar: true,
      show: config.browser.visible,
    });
    //打开URL
    logger.info("开始打开主页URL: " + config.browser.home);
    win.loadURL(config.browser.home);

    win.on("minimize", (event) => {
      event.preventDefault();
      win.hide();
    });

    win.on("close", (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        win.hide();
      }
      return false;
    });

    win.webContents.on("will-navigate", (event, url) => {
      logger.info(
        "will-navigate 发现新窗口跳转并阻止，强制内部窗口打开: " + url
      );
      event.preventDefault();
      if (win.webContents.url != url) win.loadURL(url);
    });

    win.webContents.setWindowOpenHandler((details) => {
      logger.info(
        "setWindowOpenHandler 发现新窗口跳转并阻止，强制内部窗口打开: " +
          details.url
      );
      if (win.webContents.url != details.url) win.loadURL(details.url);
      return { action: "deny" };
    });
  } catch (err) {
    logger.error("创建窗口失败:" + err);
  }
};

const createWebsocketServer = () => {
  logger.info("开始创建websocket服务:" + config.conn.websocket_server.port);
  //创建websocket服务
  const ws = new WebSocketServer({ port: config.conn.websocket_server.port });
  ws.on("connection", (ws) => {
    logger.info(`客户端已连接: ${ws._socket.remoteAddress}`);
    ws.on("message", (data) => {
      execMessage(data.toString());
    });
    ws.on("error", (err) => {
      logger.error("websocket error: " + err);
    });
    ws.on("close", () => {
      logger.info(`客户端已断开: ${ws._socket.remoteAddress}`);
    });
  });
  logger.info(
    "websocket服务开始监听端口: " + config.conn.websocket_server.port
  );
};

const createTcpServer = () => {
  logger.info("开始创建TCP服务端:" + config.conn.tcp_server.port);
  const net = require("net");
  const server = net.createServer((socket) => {
    logger.info("已连接TCP客户端: " + socket.remoteAddress);
    socket.on("data", (data) => {
      execMessage(data.toString());
    });
    socket.on("error", (err) => {
      logger.error("TCP error: " + err);
    });
    socket.on("close", () => {
      logger.info("与TCP客户端的连接已断开: " + socket.remoteAddress);
    });
  });
  server.listen(config.conn.tcp_server.port);
  logger.info("TCP服务端开始监听端口: " + config.conn.tcp_server.port);
};

const createTcpClient = () => {
  logger.info(
    "开始创建TCP客户端:" +
      config.conn.tcp_client.host +
      ":" +
      config.conn.tcp_client.port
  );
  const net = require("net");
  const client = new net.Socket();
  client.connect(
    config.conn.tcp_client.port,
    config.conn.tcp_client.host,
    () => {
      logger.info(
        "已连接到TCP服务端: " +
          config.conn.tcp_client.host +
          ":" +
          config.conn.tcp_client.port
      );
    }
  );
  client.on("data", (data) => {
    execMessage(data.toString());
  });
  client.on("error", (err) => {
    logger.error("TCP客户端 error: " + err);
  });
  client.on("close", () => {
    logger.info(
      "与TCP服务端的连接已断开:" +
        config.conn.tcp_client.host +
        ":" +
        config.conn.tcp_client.port
    );
  });
  if (trayMenu.find((item) => item.label == "重新连接TCP服务端") == null) {
    //在trayMenu中插入重新连接TCP服务端菜单
    trayMenu.splice(0, 0, {
      label: "重新连接TCP服务端",
      type: "normal",
      click: createTcpClient,
    });
    tray.setContextMenu(Menu.buildFromTemplate(trayMenu));
  }
};

const createUdp = () => {
  logger.info("开始创建UDP:" + config.conn.udp.port);
  const dgram = require("dgram");
  const server = dgram.createSocket("udp4");
  server.on("error", (err) => {
    logger.error("UDP error: " + err);
    server.close();
  });
  server.on("message", (msg, rinfo) => {
    logger.info(`UDP收到来自 ${rinfo.address}:${rinfo.port} 的消息: ${msg}`);
    execMessage(msg.toString());
  });
  server.on("listening", () => {
    const address = server.address();
    logger.info(`UDP开始监听 ${address.address}:${address.port} 的消息`);
  });
  server.bind(config.conn.udp.port);
  logger.info("UDP开始监听:" + config.conn.udp.port);
};

const createSerial = () => {
  logger.info("开始创建串口服务:" + config.conn.serial.port);
  const SerialPort = require("serialport");
  const Readline = SerialPort.parsers.Readline;
  const port = new SerialPort(config.conn.serial.port, {
    baudRate: config.conn.serial.baudrate,
  });
  const parser = port.pipe(new Readline({ delimiter: "\r\n" }));
  parser.on("data", (data) => {
    logger.info("串口服务收到消息: " + data);
    execMessage(data.toString());
  });
  port.on("error", (err) => {
    logger.error("串口服务 error: " + err);
  });
  logger.info("串口服务开始监听: " + config.conn.serial.port);
};

const createHttpServer = () => {
  logger.info("开始创建HTTP服务:" + config.conn.http_server.port);
  const http = require("http");
  const server = http.createServer((req, res) => {
    logger.info("HTTP服务收到请求: " + req.url);
    execMessage(req.url.slice(1));
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("received");
  });
  server.listen(config.conn.http_server.port);
  logger.info("HTTP开始监听:" + config.conn.http_server.port);
};

const readConfig = async () => {
  const configPath = path.join(__dirname, "./config.json");
  logger.info("索引配置文件: " + configPath);
  await read();
  async function read() {
    try {
      logger.info("异步方法读取，文件编码UTF8");
      const data = await util.promisify(fs.readFile)(configPath, "utf8");
      logger.info("配置文件内容: " + data);
      config = JSON.parse(data);
      logger.info("解析配置文件成功");
    } catch (err) {
      logger.error("读取配置文件失败: " + err);
    }
  }
};

const execMessage = (message) => {
  logger.info("收到消息: " + message);
  let msg = myutils.parseCmd(config, message);
  if (!msg) {
    logger.error("解析消息失败: " + message);
    return;
  }
  logger.info("找到消息: " + JSON.stringify(msg));
  //反射获取相应的消息处理类
  let msgObj = eval("new Msg" + msg.type + "(msg, logger, win)");
  msgObj.exec();
};

const createConnection = () => {
  try {
    logger.info("开始创建连接");
    let methods = config.conn.methods;
    logger.info("允许的连接方式: " + stringify(methods));
    methods.forEach((method) => {
      var method_seg = method.split("_");
      var realMethod = "create";
      method_seg.forEach((item) => {
        realMethod += item[0].toUpperCase() + item.slice(1);
      });
      logger.info("反射调用真实连接方法: " + realMethod);
      try {
        eval(realMethod + "()"); //反射调用方法
      } catch (err) {
        logger.error("反射调用方法 " + realMethod + " 失败: " + err);
      }
    });
  } catch (err) {
    logger.error("创建连接失败: " + err);
  }
};

app.whenReady().then(async () => {
  const configPath = path.join(__dirname, "./icon.png");
  const icon = nativeImage.createFromPath(configPath);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate(trayMenu);
  tray.setContextMenu(contextMenu);
  await readConfig();
  createWindow();
  createConnection();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
