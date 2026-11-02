import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Backend imports
import { initializeDatabase } from './backend/services/database.js';
import agentRoutes from './backend/routes/agent.js';


// ==========================================
// PATH CONFIGURATION
// ==========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ==========================================
// ENVIRONMENT VARIABLES
// ==========================================
 dotenv.config({
    path: path.join(__dirname, 'backend', '.env')
});

console.log(
    '[Config] GEMINI_API_KEY loaded:',
    Boolean(process.env.GEMINI_API_KEY)
);

console.log(
    '[Config] GEMINI_MODEL:',
    process.env.GEMINI_MODEL || 'NOT SET'
);

console.log(
    '[Config] DATABASE_URL loaded:',
    Boolean(process.env.DATABASE_URL)
);


// ==========================================
// EXPRESS APPLICATION
// ==========================================

const app = express();


// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({
    limit: '1mb'
}));


// ==========================================
// API ROUTES
// ==========================================

app.use('/api', agentRoutes);

app.use('/agent', agentRoutes);


// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {

    res.json({
        ok: true,
        time: new Date().toISOString()
    });

});


// ==========================================
// SERVE FRONTEND
// ==========================================

const frontendPath = path.join(
    __dirname,
    'frontend'
);

// Serve index.html, app.js, style.css and other assets.
app.use(express.static(frontendPath));


// ==========================================
// SERVER STARTUP
// ==========================================

const PORT = Number(process.env.PORT || 5000);

async function startServer() {

    try {

        console.log('[Startup] Connecting to Neon PostgreSQL...');

        await initializeDatabase();

        app.listen(PORT, '127.0.0.1', () => {

            console.log(
                `[Startup] TechFix Dashboard: http://127.0.0.1:${PORT}`
            );

            console.log(
                '[Startup] Neon PostgreSQL connected.'
            );

            console.log(
                '[Startup] API routes registered.'
            );

        });

    } catch (error) {

        console.error(
            '[Startup] Database connection failed:',
            error.message
        );

        process.exit(1);
    }
}

startServer();