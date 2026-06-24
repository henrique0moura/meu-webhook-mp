module.exports = (req, res) => {
  res.status(200).json({ 
    status: "webhook funcionando",
    method: req.method,
    body: req.body 
  });
};
