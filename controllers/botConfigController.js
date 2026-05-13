const { getBotConfig, createBotConfig, updateBotConfig, deleteBotConfig } = require("../services/botConfigService");

const getBotConfigHandler = async (req, res) => {
  try {
    const config = await getBotConfig();
    console.log("Retrieved bot configuration:", config);
    res.json({
      success: true,
      message: "Bot configuration retrieved successfully",
      data: config || {}
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
      data: null
    });
  }
};

const createBotConfigHandler = async (req, res) => {
  try {
    const config = await createBotConfig(req.body);
    res.status(201).json({
      success: true,
      message: "Bot configuration created successfully",
      data: config
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
      data: null
    });
  }
};

const updateBotConfigHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await updateBotConfig(id, req.body);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Bot configuration not found or no fields to update",
        data: null
      });
    }
    res.json({
      success: true,
      message: "Bot configuration updated successfully",
      data: config
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
      data: null
    });
  }
};

const deleteBotConfigHandler = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteBotConfig(id);
    res.json({
      success: true,
      message: "Bot configuration deleted successfully",
      data: null
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
      data: null
    });
  }
};

module.exports = {
  getBotConfig: getBotConfigHandler,
  createBotConfig: createBotConfigHandler,
  updateBotConfig: updateBotConfigHandler,
  deleteBotConfig: deleteBotConfigHandler
};
