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
        const commandLine = `${cmd} ${args.join(' ')}`;

        try {
            const { stdout, stderr } = await execAsync(commandLine, {
                timeout: opts.timeout || 30000 // 30s industrial limit
            });
            return { ok: true, stdout, stderr };
        } catch (err) {
            const isTimeout = err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT';
            throw {
                name: isTimeout ? 'GS_TIMEOUT' : 'GS_ERROR',
                message: err.message,
                code: err.code,
                stderr: err.stderr
            };
        }
    }
}

module.exports = new Ghostscript();
