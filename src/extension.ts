import * as vscode from 'vscode';
import { SambanovaService } from './sambanova-service';

class MermaidDiagramPanel {
    public static currentPanel: MermaidDiagramPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent();
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        // Always show in the right side panel
        const column = vscode.ViewColumn.Two;

        if (MermaidDiagramPanel.currentPanel) {
            MermaidDiagramPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mermaidDiagram',
            'Mermaid Diagram',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        MermaidDiagramPanel.currentPanel = new MermaidDiagramPanel(panel);
    }

    public updateDiagram(mermaidCode: string) {
        this._panel.webview.postMessage({
            command: 'updateDiagram',
            mermaidCode: mermaidCode.trim()
        });
    }

    private _getWebviewContent() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Mermaid Diagram</title>
            <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
            <style>
                body {
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    margin: 0;
                    overflow: hidden;
                }
                #diagram-container {
                    position: relative;
                    width: 100%;
                    height: calc(100vh - 40px);
                    overflow: hidden;
                }
                #diagram-wrapper {
                    position: absolute;
                    transform-origin: 0 0;
                    cursor: grab;
                }
                #diagram-wrapper.grabbing {
                    cursor: grabbing;
                }
                .loading {
                    display: none;
                    text-align: center;
                    padding: 20px;
                    font-size: 14px;
                    color: var(--vscode-descriptionForeground);
                }
                .loading.active {
                    display: block;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    padding: 10px;
                    margin: 10px 0;
                    display: none;
                }
                .error.active {
                    display: block;
                }
                .controls {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    display: flex;
                    gap: 10px;
                    background: var(--vscode-editor-background);
                    padding: 10px;
                    border-radius: 5px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.2);
                }
                .controls button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .controls button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div id="diagram-container">
                <div id="diagram-wrapper"></div>
            </div>
            <div class="controls">
                <button id="zoom-in">+</button>
                <button id="zoom-out">-</button>
                <button id="reset">Reset</button>
            </div>
            <div class="loading">Generating diagram...</div>
            <div class="error"></div>
            <script>
                const diagramContainer = document.getElementById('diagram-container');
                const diagramWrapper = document.getElementById('diagram-wrapper');
                const loadingEl = document.querySelector('.loading');
                const errorEl = document.querySelector('.error');
                const zoomInBtn = document.getElementById('zoom-in');
                const zoomOutBtn = document.getElementById('zoom-out');
                const resetBtn = document.getElementById('reset');

                let scale = 1;
                let translateX = 0;
                let translateY = 0;
                let isDragging = false;
                let startX = 0;
                let startY = 0;

                // Initialize mermaid with VS Code theme detection
                mermaid.initialize({ 
                    startOnLoad: true,
                    theme: document.body.classList.contains('vscode-dark') ? 'dark' : 'default',
                    securityLevel: 'loose',
                    flowchart: {
                        useMaxWidth: true,
                        htmlLabels: true,
                        curve: 'basis'
                    }
                });

                function updateTransform() {
                    diagramWrapper.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
                }

                // Pan functionality
                diagramWrapper.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    diagramWrapper.classList.add('grabbing');
                    startX = e.clientX - translateX;
                    startY = e.clientY - translateY;
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    translateX = e.clientX - startX;
                    translateY = e.clientY - startY;
                    updateTransform();
                });

                document.addEventListener('mouseup', () => {
                    isDragging = false;
                    diagramWrapper.classList.remove('grabbing');
                });

                // Zoom functionality
                zoomInBtn.addEventListener('click', () => {
                    scale = Math.min(scale * 1.2, 5);
                    updateTransform();
                });

                zoomOutBtn.addEventListener('click', () => {
                    scale = Math.max(scale / 1.2, 0.1);
                    updateTransform();
                });

                resetBtn.addEventListener('click', () => {
                    scale = 1;
                    translateX = 0;
                    translateY = 0;
                    updateTransform();
                });

                // Mouse wheel zoom
                diagramContainer.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const delta = e.deltaY;
                    const scaleChange = delta > 0 ? 0.9 : 1.1;
                    const newScale = Math.max(0.1, Math.min(5, scale * scaleChange));
                    
                    // Calculate cursor position relative to diagram
                    const rect = diagramContainer.getBoundingClientRect();
                    const x = e.clientX - rect.left - translateX;
                    const y = e.clientY - rect.top - translateY;
                    
                    // Adjust translation to zoom towards cursor
                    translateX += x * (1 - scaleChange);
                    translateY += y * (1 - scaleChange);
                    scale = newScale;
                    
                    updateTransform();
                }, { passive: false });

                window.addEventListener('message', async event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'updateDiagram':
                            try {
                                loadingEl.classList.remove('active');
                                errorEl.classList.remove('active');
                                
                                // Clear previous diagram
                                diagramWrapper.innerHTML = '';
                                
                                // Create a new container for this render
                                const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                                const container = document.createElement('div');
                                container.id = id;
                                container.textContent = message.mermaidCode;
                                diagramWrapper.appendChild(container);
                                
                                // Reset transform when new diagram is loaded
                                scale = 1;
                                translateX = 0;
                                translateY = 0;
                                updateTransform();
                                
                                // Render the new diagram
                                await mermaid.run({
                                    nodes: [container]
                                });
                            } catch (error) {
                                console.error('Mermaid rendering error:', error);
                                errorEl.textContent = 'Failed to render diagram: ' + error.message;
                                errorEl.classList.add('active');
                            }
                            break;
                        case 'startLoading':
                            loadingEl.classList.add('active');
                            diagramWrapper.innerHTML = '';
                            errorEl.classList.remove('active');
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }

    public showLoading() {
        this._panel.webview.postMessage({ command: 'startLoading' });
    }

    public dispose() {
        MermaidDiagramPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Create service with the extension context
    const sambanovaService = new SambanovaService(vscode.window.createOutputChannel('Mermaid Code Diagram'), context);

    let disposable = vscode.commands.registerCommand('mermaid-code-diagram.generateDiagram', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor!');
            return;
        }

        const document = editor.document;
        const fileContent = document.getText();

        // Create or show the panel
        MermaidDiagramPanel.createOrShow(context.extensionUri);
        if (!MermaidDiagramPanel.currentPanel) {
            return;
        }

        // Show loading state
        MermaidDiagramPanel.currentPanel.showLoading();

        try {
            // Generate diagram using SambaNova
            const mermaidDiagram = await sambanovaService.generateMermaidDiagram(fileContent);

            // Update the diagram in the panel
            MermaidDiagramPanel.currentPanel.updateDiagram(mermaidDiagram);
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Failed to generate diagram: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('An unknown error occurred while generating the diagram');
            }

            // Show error state in the panel
            if (MermaidDiagramPanel.currentPanel) {
                MermaidDiagramPanel.currentPanel.updateDiagram(`flowchart TD
                    A[Error] -->|Failed to generate diagram| B[Please check your configuration and try again]`);
            }
        }
    });

    let clearApiKeyDisposable = vscode.commands.registerCommand('mermaid-code-diagram.clearApiKey', async () => {
        try {
            await context.secrets.delete('sambanovaApiKey');
            vscode.window.showInformationMessage('API Key has been cleared successfully.');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to clear API Key.');
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(clearApiKeyDisposable);
}

export function deactivate() { } 