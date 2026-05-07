/**
 * Ghostscript Wrapper
 * 
 * Provides a portable interface for Ghostscript operations.
 */
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class Ghostscript {
    resolveGsCmd() {
        return process.platform === 'win32' ? 'gswin64c' : 'gs';
    }

    async runGs(args, opts = {}) {
        const cmd = this.resolveGsCmd();
        const commandLine = `${cmd} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
        
        // Timeout logic: ENV > opts.timeout > Default (120s)
        const defaultTimeout = parseInt(process.env.GS_TIMEOUT_MS || process.env.PPOS_GS_TIMEOUT_MS || '120000');
        const timeout = opts.timeout || defaultTimeout;
        const reqId = opts.reqId || 'generic';

        console.log(`[ENGINE][GS][EXEC][${reqId}] Command: ${commandLine}`);
        console.log(`[ENGINE][GS][EXEC][${reqId}] Timeout: ${timeout}ms`);

        const start = Date.now();
        try {
            const { stdout, stderr } = await execAsync(commandLine, { timeout });
            const duration = Date.now() - start;

            console.log(`[ENGINE][GS][OK][${reqId}] Duration: ${duration}ms`);
            
            // v2.4.121: Tolerate repair warnings if exit code is 0
            const hasFatalError = stderr && (
                /Unrecoverable error/i.test(stderr) || 
                /Error: \//i.test(stderr) ||
                (stderr.includes('Error') && !/repaired|ignored|warnings encountered|notify the author/i.test(stderr))
            );

            if (hasFatalError) {
                console.error(`[ENGINE][GS][ERROR-CONTENT][${reqId}] Stderr: ${stderr}`);
                throw { 
                    name: 'GS_ERROR', 
                    message: `Ghostscript reported internal error: ${stderr.substring(0, 500)}`, 
                    code: 'GS_STDERR_ERROR', 
                    stderr,
                    stdout,
                    duration
                };
            }

            if (stderr && stderr.trim()) {
                console.warn(`[ENGINE][GS][WARN][${reqId}] for tolerated stderr: ${stderr.substring(0, 200).replace(/\r?\n|\r/g, ' ')}...`);
            }

            return { ok: true, stdout, stderr, duration };
        } catch (err) {
            const duration = Date.now() - start;
            const isTimeout = err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
            
            console.error(`[ENGINE][GS][FAIL][${reqId}] Duration: ${duration}ms`);
            console.error(`[ENGINE][GS][FAIL][${reqId}] Code: ${err.code}, Signal: ${err.signal}`);
            if (err.stderr) console.error(`[ENGINE][GS][FAIL][${reqId}] Stderr: ${err.stderr}`);

            throw {
                name: isTimeout ? 'GS_TIMEOUT' : 'GS_ERROR',
                message: isTimeout ? `Ghostscript timed out after ${timeout}ms` : err.message,
                code: err.code,
                signal: err.signal,
                stderr: err.stderr,
                stdout: err.stdout,
                duration
            };
        }
    }
}

module.exports = new Ghostscript();

