import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import agentRoutes from './routes/agent.js';

dotenv.config({
    path: "./backend/.env"
});

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow all origins
app.use(cors());
app.use(express.json());

// Serve frontend folder
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Routes
// Routes
app.use('/agent', agentRoutes);

// Compatibility routes for the existing frontend
app.use('/api', agentRoutes);

app.get('/health', (_, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});
// All other routes serve frontend
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend agent running on port ${PORT}`);
});