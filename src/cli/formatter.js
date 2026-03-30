/**
 * @ppos/preflight-engine CLI Formatter
 * 
 * Handles stdout/stderr discipline and JSON/Human formatting.
 */
const chalk = require('chalk');

class Formatter {
    static format(result, options) {
        const { exitCode, data, error, message } = result;

        if (error) {
            this._printError(error, message, options.verbose);
            return;
        }

        if (options.json) {
            this._printJson(data);
        } else {
            this._printHuman(data);
        }
    }

    static _printJson(data) {
        const payload = {
            ...data,
            wrapper_metadata: {
                timestamp: new Date().toISOString(),
                summary: {
                    finding_count: data.engine_result?.findings?.length || 0,
                    success_status: data.status || (data.engine_result?.ok ? 'SUCCESS' : 'INDUSTRIAL_FAIL')
                }
            }
        };
        // Payloads go only to stdout
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    }

    static _printHuman(data) {
        const { operation, file, engine_result, status, reason } = data;

        console.log(chalk.bold(`\nPPOS-PREFLIGHT: ${operation.toUpperCase()} ${file}`));
        console.log(chalk.dim('---------------------------------'));

        if (operation === 'analyze') {
            const findings = engine_result.findings || [];
            if (findings.length === 0) {
                console.log(chalk.green(' [PASS] No technical findings identified.'));
            } else {
                findings.forEach(f => {
                    const isFail = f.code.startsWith('IND_GEOM');
                    const icon = isFail ? chalk.red(' [FAIL]') : chalk.yellow(' [INFO]');
                    console.log(`${icon} ${chalk.bold(f.code)}: ${JSON.stringify(f.context)}`);
                });
                console.log(chalk.bold(`\nSummary: ${findings.length} finding(s) identified.`));
            }
        }

        if (operation === 'autofix') {
            if (status === 'SUCCESS') {
                console.log(chalk.green(` [OK] Fix applied successfully: ${data.output}`));
            } else {
                console.log(chalk.yellow(` [OK] ${reason}`));
                console.log(chalk.dim(' No changes applied.'));
            }
        }
        console.log(''); // Trailing newline
    }

    static _printError(error, message, verbose) {
        // Operational errors go only to stderr
        process.stderr.write(chalk.red.bold(`\nERROR: ${error}\n`));
        process.stderr.write(chalk.red(`${message}\n`));
        if (verbose && error.stack) {
            process.stderr.write(chalk.dim(`${error.stack}\n`));
        }
    }
}

module.exports = { Formatter };
