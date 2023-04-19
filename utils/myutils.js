exports.parseCmd = function(config, name) {
  return config.messages.find((item) => {
    return item.name == name;
  });
}