require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./routes');
const { startScheduler, runCheck } = require('./scheduler');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Zoommer Watch running on http://localhost:${PORT}`);
  startScheduler();
  runCheck().catch(err => console.error('Initial check failed:', err));
});
