web э прилоенито и раз#!/usr/bin/env node

// EMDR Bilateral GitHub Webhook Handler
// Automatically deploys application when receiving webhook from GitHub

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret';
const PORT = process.env.WEBHOOK_PORT || 3001;
const DEPLOY_SCRIPT = '/var/www/html/deploy.sh';

// Colors for console output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m'; // No Color

function log(message) {
    console.log(`${GREEN}[${new Date().toISOString()}] ${message}${NC}`);
}

function warn(message) {
    console.log(`${YELLOW}[${new Date().toISOString()}] WARNING: ${message}${NC}`);
}

function error(message) {
    console.log(`${RED}[${new Date().toISOString()}] ERROR: ${message}${NC}`);
}

function verifySignature(payload, signature, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function runDeployment(callback) {
    log('🚀 Starting deployment...');

    exec(`bash ${DEPLOY_SCRIPT}`, (error, stdout, stderr) => {
        if (error) {
            error(`Deployment failed: ${error.message}`);
            if (callback) callback(error);
            return;
        }

        if (stderr) {
            warn(`Deployment stderr: ${stderr}`);
        }

        log('✅ Deployment completed successfully');
        log('📋 Deployment output:');
        console.log(stdout);

        if (callback) callback(null, stdout);
    });
}

const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const signature = req.headers['x-hub-signature-256'];

        if (!signature) {
            warn('Missing signature header');
            res.writeHead(401);
            res.end('Unauthorized');
            return;
        }

        if (!verifySignature(body, signature, WEBHOOK_SECRET)) {
            warn('Invalid signature');
            res.writeHead(401);
            res.end('Unauthorized');
            return;
        }

        let payload;
        try {
            payload = JSON.parse(body);
        } catch (e) {
            error('Invalid JSON payload');
            res.writeHead(400);
            res.end('Bad Request');
            return;
        }

        // Check if it's a push to stable branch
        if (payload.ref === 'refs/heads/stable' && payload.repository) {
            log(`🔄 Push detected to stable branch from ${payload.repository.full_name}`);

            runDeployment((error, output) => {
                if (error) {
                    res.writeHead(500);
                    res.end('Deployment failed');
                } else {
                    res.writeHead(200);
                    res.end('Deployment successful');
                }
            });
        } else {
            log('ℹ️ Ignoring push to non-stable branch or non-push event');
            res.writeHead(200);
            res.end('Ignored');
        }
    });
});

server.listen(PORT, () => {
    log(`🎣 GitHub Webhook server listening on port ${PORT}`);
    log(`📝 Expected repository: davidbugayov/bilateralbound`);
    log(`🌿 Watched branch: main`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Shutting down webhook server...');
    server.close(() => {
        process.exit(0);
    });
});
