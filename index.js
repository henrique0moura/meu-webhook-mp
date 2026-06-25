/* global process */
const express = require("express");
const app = express();

app.use(express.json());

const createPreference = require("./create-preference");
const webhook = require("./webhook");

app.post("/api/create-preference", createPreference);
app.post("/api/webhook", webhook);

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
