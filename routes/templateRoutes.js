const express = require("express");
const router = express.Router();
const {
  createTemplate,
  getTemplates,
  getTemplateByKey,
  updateTemplate,
  deleteTemplate,
  deleteTemplateGroup
} = require("../controllers/templateController");
const { authMiddleware, adminMiddleware } = require("../middleware/authMiddleware");

router.use(authMiddleware);
router.use(adminMiddleware);

router.post("/", createTemplate);
router.get("/", getTemplates);
router.get("/:key", getTemplateByKey);
router.put("/", updateTemplate);
router.delete("/:id", deleteTemplate);
router.delete("/group/:id", deleteTemplateGroup);

module.exports = router;
