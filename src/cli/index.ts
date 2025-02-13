import commander from 'commander';
import MycostrClient from '../client/interface';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

class MycostrCLI {
    private client: MycostrClient;
    private program: commander.Command;

    constructor() {
        this.client = new MycostrClient();
        this.program = new commander.Command();
        this.setupCommands();
    }

    private setupCommands() {
        this.program
            .name('mycostr')
            .description('Bitcoin-native distributed storage')
            .version('0.1.0');

        // Store command
        this.program
            .command('store <file>')
            .description('Store a file')
            .option('-r, --redundancy <level>', 'redundancy level (minimum, standard, maximum)', 'standard')
            .option('-c, --custom-redundancy <number>', 'custom redundancy level')
            .option('--regions <regions>', 'preferred regions (comma-separated)')
            .action(async (file, options) => {
                try {
                    console.log(`Reading file: ${file}`);
                    const data = await readFile(file);
                    
                    const receipt = await this.client.storeFile(data, {
                        redundancyLevel: options.redundancy,
                        customRedundancy: parseInt(options.customRedundancy),
                        preferredRegions: options.regions?.split(',')
                    });

                    console.log('Storage successful!');
                    console.log('File ID:', receipt.fileId);
                    console.log('Cost:', receipt.cost, 'sats');
                } catch (error) {
                    console.error('Storage failed:', error.message);
                }
            });

        // Retrieve command
        this.program
            .command('retrieve <fileId> <output>')
            .description('Retrieve a file')
            .action(async (fileId, output) => {
                try {
                    console.log(`Retrieving file: ${fileId}`);
                    const data = await this.client.retrieveFile(fileId);
                    
                    await writeFile(output, data);
                    console.log(`File saved to: ${output}`);
                } catch (error) {
                    console.error('Retrieval failed:', error.message);
                }
            });

        // Status command
        this.program
            .command('status <fileId>')
            .description('Check file storage status')
            .action(async (fileId) => {
                try {
                    const status = await this.client.getStorageStatus(fileId);
                    console.log('Storage Status:');
                    console.log('----------------');
                    console.log('File ID:', status.fileId);
                    console.log('Chunks:', status.chunks);
                    console.log('Storage Nodes:', status.nodesStoring);
                    console.log('Redundancy Level:', status.redundancyLevel);
                    console.log('Regions:', status.regions.join(', '));
                    console.log('Health:', `${status.health}%`);
                    console.log('Last Verified:', status.lastVerified);
                } catch (error) {
                    console.error('Status check failed:', error.message);
                }
            });

        // Payment info command
        this.program
            .command('payment-info')
            .description('Show payment information')
            .action(async () => {
                try {
                    // TODO: Implement payment info retrieval
                    console.log('Payment Information:');
                    console.log('-------------------');
                    console.log('Current Balance: XXX sats');
                    console.log('Active Channels: X');
                    console.log('Total Spent: XXX sats');
                } catch (error) {
                    console.error('Failed to get payment info:', error.message);
                }
            });
    }

    public async run() {
        await this.program.parseAsync(process.argv);
    }
}

// Run CLI
const cli = new MycostrCLI();
cli.run().catch(console.error);
