#!/usr/bin/env node

/**
 * @ppos/preflight-engine CLI Entrypoint
 */
const { CliParser } = require('../src/cli/parser');
const { CommandHandler } = require('../src/cli/commands');
const { Formatter } = require('../src/cli/formatter');

async function main() {
    const args = CliParser.parse(process.argv);

    if (!args) return; // Help was shown

    try {
        const result = await CommandHandler.execute(args);

        // Output formatting
        Formatter.format(result, args.options);

        // Exit process with stable code
        if (result.exitCode !== undefined) {
            process.exit(result.exitCode);
        }
    } catch (err) {
        // Handle unexpected runtime errors
        Formatter.format({
            error: err.name || 'RUNTIME_ERROR',
            message: err.message,
            stack: err.stack,
            exitCode: 5
        }, args.options || {});
        process.exit(5);
    }
}

// Global Rejection Handling
process.on('unhandledRejection', (reason) => {
    process.stderr.write(`\nCRITICAL: Unhandled Rejection: ${reason}\n`);
    process.exit(4); // ENGINE_ERROR
});

main();
