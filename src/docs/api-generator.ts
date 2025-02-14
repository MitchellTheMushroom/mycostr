interface APIEndpoint {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    description: string;
    parameters?: APIParameter[];
    requestBody?: APISchema;
    responses: Record<string, APIResponse>;
    examples?: APIExample[];
}

interface APIParameter {
    name: string;
    location: 'path' | 'query' | 'header';
    required: boolean;
    type: string;
    description: string;
}

interface APISchema {
    type: string;
    properties: Record<string, {
        type: string;
        description: string;
        required?: boolean;
    }>;
}

interface APIResponse {
    status: number;
    description: string;
    schema?: APISchema;
}

interface APIExample {
    description: string;
    request: string;
    response: string;
}

class APIDocumentationGenerator {
    private endpoints: Map<string, APIEndpoint>;
    private basePath: string;

    constructor(basePath: string = '/api') {
        this.endpoints = new Map();
        this.basePath = basePath;
        this.registerEndpoints();
    }

    private registerEndpoints(): void {
        // File Operations
        this.addEndpoint({
            path: '/files/upload',
            method: 'POST',
            description: 'Upload a file to the storage network',
            requestBody: {
                type: 'multipart/form-data',
                properties: {
                    file: {
                        type: 'file',
                        description: 'The file to upload',
                        required: true
                    },
                    redundancy: {
                        type: 'string',
                        description: 'Redundancy level (minimum, standard, maximum)',
                    },
                    regions: {
                        type: 'string',
                        description: 'Comma-separated list of preferred regions'
                    }
                }
            },
            responses: {
                '200': {
                    status: 200,
                    description: 'File uploaded successfully',
                    schema: {
                        type: 'object',
                        properties: {
                            fileId: {
                                type: 'string',
                                description: 'Unique identifier for the stored file'
                            }
                        }
                    }
                }
            },
            examples: [{
                description: 'Upload a file with standard redundancy',
                request: `
curl -X POST ${this.basePath}/files/upload \
  -F "file=@example.txt" \
  -F "redundancy=standard"
                `.trim(),
                response: `
{
  "fileId": "file_abc123",
  "status": "stored",
  "redundancy": "standard"
}
                `.trim()
            }]
        });

        // Add more endpoints...
    }

    private addEndpoint(endpoint: APIEndpoint): void {
        const key = `${endpoint.method} ${endpoint.path}`;
        this.endpoints.set(key, endpoint);
    }

    generateMarkdown(): string {
        let markdown = `# API Documentation\n\n`;
        markdown += `Base URL: ${this.basePath}\n\n`;

        // Group endpoints by category
        const categories = new Map<string, APIEndpoint[]>();
        for (const [, endpoint] of this.endpoints) {
            const category = endpoint.path.split('/')[1];
            if (!categories.has(category)) {
                categories.set(category, []);
            }
            categories.get(category)!.push(endpoint);
        }

        // Generate documentation for each category
        for (const [category, endpoints] of categories) {
            markdown += `## ${category.toUpperCase()}\n\n`;

            for (const endpoint of endpoints) {
                markdown += this.generateEndpointDocs(endpoint);
            }
        }

        return markdown;
    }

    generateHTML(): string {
        const markdown = this.generateMarkdown();
        // Convert markdown to HTML (implementation needed)
        return `<html>
            <head>
                <title>API Documentation</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; }
                    h2 { color: #333; margin-top: 30px; }
                    .endpoint { margin-bottom: 30px; }
                    .method { font-weight: bold; }
                    .path { color: #0066cc; }
                </style>
            </head>
            <body>
                ${markdown}
            </body>
        </html>`;
    }

    private generateEndpointDocs(endpoint: APIEndpoint): string {
        let docs = `### ${endpoint.method} ${endpoint.path}\n\n`;
        docs += `${endpoint.description}\n\n`;

        if (endpoint.parameters?.length) {
            docs += `#### Parameters\n\n`;
            docs += `| Name | Location | Type | Required | Description |\n`;
            docs += `|------|----------|------|----------|-------------|\n`;
            for (const param of endpoint.parameters) {
                docs += `| ${param.name} | ${param.location} | ${param.type} | ${param.required} | ${param.description} |\n`;
            }
            docs += `\n`;
        }

        if (endpoint.requestBody) {
            docs += `#### Request Body\n\n`;
            docs += `Type: ${endpoint.requestBody.type}\n\n`;
            docs += `| Property | Type | Required | Description |\n`;
            docs += `|----------|------|----------|-------------|\n`;
            for (const [name, prop] of Object.entries(endpoint.requestBody.properties)) {
                docs += `| ${name} | ${prop.type} | ${prop.required || false} | ${prop.description} |\n`;
            }
            docs += `\n`;
        }

        docs += `#### Responses\n\n`;
        for (const [code, response] of Object.entries(endpoint.responses)) {
            docs += `**${code}**: ${response.description}\n\n`;
            if (response.schema) {
                docs += `Response schema:\n\`\`\`json\n${JSON.stringify(response.schema, null, 2)}\n\`\`\`\n\n`;
            }
        }

        if (endpoint.examples?.length) {
            docs += `#### Examples\n\n`;
            for (const example of endpoint.examples) {
                docs += `${example.description}:\n\n`;
                docs += `Request:\n\`\`\`bash\n${example.request}\n\`\`\`\n\n`;
                docs += `Response:\n\`\`\`json\n${example.response}\n\`\`\`\n\n`;
            }
        }

        return docs;
    }
}

export default APIDocumentationGenerator;
export {
    APIEndpoint,
    APIParameter,
    APISchema,
    APIResponse,
    APIExample
};
