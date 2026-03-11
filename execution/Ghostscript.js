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

    async runGs(args) {
        const cmd = this.resolveGsCmd();
        const commandLine = `${cmd} ${args.join(' ')}`;
        return execAsync(commandLine);
    }
}

module.exports = new Ghostscript();
