/**
 * @ppos/preflight-engine CLI Parser
 * 
 * Handles command definitions, options, and help generation using Commander.
 */
const { Command } = require('commander');
const { version } = require('../../package.json');

class CliParser {
    static parse(argv) {
        const program = new Command();

        program
            .name('ppos-preflight')
            .description('Standalone CLI for PrintPrice Preflight Engine')
            .version(version);

        // Analyze Command
        program
            .command('analyze <input>')
            .description('Perform technical interpretation of a PDF file')
            .option('-c, --config <path>', 'Path to engine configuration JSON')
            .option('-j, --json', 'Output raw JSON finding payload', false)
            .option('-v, --verbose', 'Print step-by-step technical logs to stderr', false)
            .action((input, options) => {
                program.args_custom = { command: 'analyze', input, options };
            });

        // Autofix Command
        program
            .command('autofix <input>')
            .description('Apply technical fixes to a PDF file')
            .requiredOption('-o, --output <path>', 'Path for the fixed PDF file')
            .option('-c, --config <path>', 'Path to engine configuration JSON')
            .option('-f, --fix <code_or_category>', 'Optional filter for specific fixes')
            .option('-j, --json', 'Output raw JSON results', false)
            .option('-v, --verbose', 'Print step-by-step technical logs to stderr', false)
            .action((input, options) => {
                program.args_custom = { command: 'autofix', input, options };
            });

        program.parse(argv);

        if (!program.args_custom) {
            program.help();
        }

        return program.args_custom;
    }
}

module.exports = { CliParser };
