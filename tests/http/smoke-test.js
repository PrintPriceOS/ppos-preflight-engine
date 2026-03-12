/**
 * HTTP Service Smoke Test
 * 
 * Verifies that the Fastify server starts and responds to basic health checks.
 */
const { spawn } = require('child_process');
const http = require('http');

async function testHealth() {
    console.log('[SMOKE] Starting Preflight Service...');

    // Exact absolute path
    const serviceDir = 'c:/Users/KIKE/Desktop/PrintPricePro_Preflight-master (7)/ppos-preflight-service';

    // Start server as a background process
    const server = spawn('node', ['server.js'], {
        cwd: serviceDir,
        env: { ...process.env, PPOS_PORT: '3123' }
    });

    server.stdout.on('data', (data) => console.log(`[SERVER] ${data}`));
    server.stderr.on('data', (data) => console.error(`[SERVER-ERR] ${data}`));

    // Wait for server to boot
    console.log('[SMOKE] Waiting 3s for boot...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('[SMOKE] Probing http://localhost:3123/health ...');

    return new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3123/health', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`[SMOKE] Status: ${res.statusCode}`);
                console.log(`[SMOKE] Response: ${body}`);
                server.kill();
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('[SMOKE] Connection Error:', err.message);
            server.kill();
            reject(err);
        });

        // Timeout for the request itself
        req.setTimeout(5000, () => {
            console.error('[SMOKE] Request Timeout');
            req.destroy();
            server.kill();
            reject(new Error('Timeout'));
        });
    });
}

testHealth()
    .then(() => {
        console.log('[PASS] HTTP Service Smoke Test Successful.');
        process.exit(0);
    })
    .catch(err => {
        console.error(`[FAIL] HTTP Service Smoke Test Failed: ${err.message}`);
        process.exit(1);
    });
