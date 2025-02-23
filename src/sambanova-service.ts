import axios from 'axios';
import * as vscode from 'vscode';

export class SambanovaService {
    private apiKey: string = '';
    private readonly endpoint: string = 'https://api.sambanova.ai/v1/chat/completions';
    private outputChannel: vscode.OutputChannel;
    private secretStorage: vscode.SecretStorage;
    private initialized: boolean = false;

    constructor(outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext) {
        this.outputChannel = outputChannel;
        this.secretStorage = context.secrets;
    }

    private async ensureInitialized() {
        if (!this.initialized) {
            await this.initializeApiKey();
            this.initialized = true;
        }
    }

    private async initializeApiKey() {
        try {
            this.apiKey = await this.secretStorage.get('sambanovaApiKey') || '';
        } catch (error) {
            throw new Error('Failed to retrieve API key from secure storage');
        }
    }

    private async updateApiKey(newKey: string) {
        try {
            await this.secretStorage.store('sambanovaApiKey', newKey);
            this.apiKey = newKey;
            this.initialized = false;
        } catch (error) {
            throw new Error('Failed to store API key in secure storage');
        }
    }

    private cleanMermaidDiagram(content: string): string {
        // Just remove any markdown code block markers if present
        return content.replace(/```mermaid\n?/g, '')
            .replace(/```(\w+)?\n?/g, '')
            .trim();
    }

    public async generateMermaidDiagram(codeContent: string, retryCount = 0): Promise<string> {
        const MAX_RETRIES = 3;

        try {
            await this.ensureInitialized();

            if (!await this.validateConfig()) {
                throw new Error('SambaNova configuration is incomplete');
            }

            const systemPrompt = `You are a code analysis assistant that generates Mermaid.js diagrams. You must follow these rules EXACTLY:
1. Generate ONLY ONE diagram
2. Start with EXACTLY ONE 'flowchart TD'
3. DO NOT include any explanations or text
4. DO NOT use markdown formatting or code blocks
5. DO NOT include multiple diagram declarations
6. Follow this EXACT structure:
   - First: Node definitions using ACTUAL NAMES from the code (one per line)
   - Second: All connections using --> with MEANINGFUL labels
   - Last: All style definitions

7. Use ONLY these shapes for specific components:
   IMPORTANT: Replace ALL shape names with the actual name from the code, both in node ID and shape definition
   CORRECT: UserService[UserService], getUser(getUser)
   WRONG: Rectangle[UserService], RoundedRectangle(getUser)
   
   Core Components:
   - Classes/Services: [Rectangle]
   - Functions/Methods: (RoundedRectangle)
   
   Data Storage:
   - Databases: [(Database)]
   - Cache Systems: {{Hexagon}}
   - Message Queues: [/Parallelogram/]

   External Services:
   - API Endpoints: [[Subroutine]]
   - Third-party Services: ((Circle))
   - Auth Services: {Diamond}

   Infrastructure:
   - Load Balancers: [LoadBalancer>]
   - API Gateways: [/Gateway\\]

   Default:
   - Other Components: [Rectangle]

8. Use these colors in style definitions at the end:
   - Classes/Services: fill:#c586c0,stroke:#333
   - Functions/Methods: fill:#4fc1ff,stroke:#333
   - Databases: fill:#ce9178,stroke:#333
   - Cache Systems: fill:#dcdcaa,stroke:#333
   - Message Queues: fill:#4ec9b0,stroke:#333
   - API Endpoints: fill:#4ec9b0,stroke:#333
   - Third-party Services: fill:#f44747,stroke:#333
   - Auth Services: fill:#ffd700,stroke:#333
   - Load Balancers: fill:#569cd6,stroke:#333
   - API Gateways: fill:#646695,stroke:#333
   - Other Components: fill:#808080,stroke:#333

9. Connection labels must be descriptive of the actual relationship:
   - For method calls: use the method name (e.g. -->|calls getUser|)
   - For data flow: describe the data (e.g. -->|user data|)
   - For dependencies: describe the dependency type (e.g. -->|manages|, -->|configures|)
   - For initialization: use -->|initializes| or -->|creates|
   - For events: describe the event (e.g. -->|on update|)
   - NEVER use generic labels like "uses" or "connects"

Example:
flowchart TD
    UserService[UserService]
    UserDB[(UserDB)]
    RedisCache{{RedisCache}}
    getUser(getUser)
    updateUser(updateUser)
    
    UserService -->|calls| getUser
    getUser -->|queries| UserDB
    getUser -->|caches result| RedisCache
    UserService -->|calls| updateUser
    updateUser -->|returns status| UserService
    
    style UserService fill:#c586c0,stroke:#333
    style UserDB fill:#ce9178,stroke:#333
    style RedisCache fill:#dcdcaa,stroke:#333
    style getUser fill:#4fc1ff,stroke:#333
    style updateUser fill:#4fc1ff,stroke:#333`;

            const userPrompt = `Analyze this code and create a diagram showing the relationships between components. Use specific, descriptive labels for connections based on how components actually interact (method calls, data flow, events, etc). DO NOT use generic labels like "uses".

Code to analyze:
\`\`\`
${codeContent}
\`\`\``;

            try {
                const response = await axios.post(this.endpoint, {
                    stream: false,
                    model: "Meta-Llama-3.1-70B-Instruct",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ]
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.choices && response.data.choices.length > 0) {
                    const modelOutput = response.data.choices[0].message.content;
                    const mermaidDiagram = this.cleanMermaidDiagram(modelOutput);

                    if (!mermaidDiagram) {
                        throw new Error('No diagram generated from the API');
                    }

                    try {
                        if (!mermaidDiagram.startsWith('flowchart TD') && !mermaidDiagram.startsWith('graph TD')) {
                            throw new Error('Invalid diagram syntax: Must start with flowchart TD or graph TD');
                        }

                        return mermaidDiagram;
                    } catch (error) {
                        if (retryCount < MAX_RETRIES - 1) {
                            return this.generateMermaidDiagram(codeContent, retryCount + 1);
                        } else {
                            throw error;
                        }
                    }
                } else {
                    throw new Error('No output received from the model');
                }
            } catch (error: any) {
                if (retryCount < MAX_RETRIES - 1) {
                    return this.generateMermaidDiagram(codeContent, retryCount + 1);
                }
                throw error;
            }
        } catch (error: any) {
            if (retryCount >= MAX_RETRIES - 1) {
                throw new Error(`Failed to generate diagram: ${error.message}`);
            }
            throw error;
        }
    }

    private async validateConfig(): Promise<boolean> {
        const apiKey = await this.secretStorage.get('sambanovaApiKey');
        if (!apiKey) {
            const configureNow = 'Configure Now';
            const response = await vscode.window.showErrorMessage(
                'SambaNova API key is not configured.',
                configureNow
            );

            if (response === configureNow) {
                const newApiKey = await vscode.window.showInputBox({
                    prompt: 'Enter your SambaNova API Key',
                    password: true
                });
                if (newApiKey) {
                    await this.updateApiKey(newApiKey);
                    await this.initializeApiKey();
                    this.initialized = true;
                    return true;
                }
            }
            return false;
        }
        return true;
    }
} 