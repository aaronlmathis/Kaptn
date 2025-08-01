import React, { useRef } from 'react';
import * as monaco from 'monaco-editor';
import { Editor } from '@monaco-editor/react';

interface YamlEditorProps {
	value: string;
	onChange: (value: string) => void;
	height?: string;
	readOnly?: boolean;
	className?: string;
}

const YamlEditor: React.FC<YamlEditorProps> = ({
	value,
	onChange,
	height = '400px',
	readOnly = false,
	className = '',
}) => {
	const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

	const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
		editorRef.current = editor;

		// Configure YAML language features
		monaco.languages.setLanguageConfiguration('yaml', {
			comments: {
				lineComment: '#',
			},
			brackets: [
				['{', '}'],
				['[', ']'],
			],
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '"', close: '"' },
				{ open: "'", close: "'" },
			],
			surroundingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '"', close: '"' },
				{ open: "'", close: "'" },
			],
			folding: {
				offSide: true,
			},
		});

		// Add basic Kubernetes YAML completion items
		monaco.languages.registerCompletionItemProvider('yaml', {
			provideCompletionItems: (model, position) => {
				const word = model.getWordUntilPosition(position);
				const range = {
					startLineNumber: position.lineNumber,
					endLineNumber: position.lineNumber,
					startColumn: word.startColumn,
					endColumn: word.endColumn,
				};

				const suggestions: monaco.languages.CompletionItem[] = [
					{
						label: 'apiVersion',
						kind: monaco.languages.CompletionItemKind.Property,
						insertText: 'apiVersion: ',
						documentation: 'The API version of the resource',
						range,
					},
					{
						label: 'kind',
						kind: monaco.languages.CompletionItemKind.Property,
						insertText: 'kind: ',
						documentation: 'The kind of Kubernetes resource',
						range,
					},
					{
						label: 'metadata',
						kind: monaco.languages.CompletionItemKind.Property,
						insertText: 'metadata:\n  name: ',
						documentation: 'Resource metadata',
						range,
					},
					{
						label: 'spec',
						kind: monaco.languages.CompletionItemKind.Property,
						insertText: 'spec:\n  ',
						documentation: 'Resource specification',
						range,
					},
					{
						label: 'ConfigMap',
						kind: monaco.languages.CompletionItemKind.Class,
						insertText: [
							'apiVersion: v1',
							'kind: ConfigMap',
							'metadata:',
							'  name: ${1:my-config}',
							'  namespace: ${2:default}',
							'data:',
							'  ${3:key}: ${4:value}',
						].join('\n'),
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: 'Create a ConfigMap resource',
						range,
					},
					{
						label: 'Secret',
						kind: monaco.languages.CompletionItemKind.Class,
						insertText: [
							'apiVersion: v1',
							'kind: Secret',
							'metadata:',
							'  name: ${1:my-secret}',
							'  namespace: ${2:default}',
							'type: Opaque',
							'data:',
							'  ${3:key}: ${4:base64-encoded-value}',
						].join('\n'),
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: 'Create a Secret resource',
						range,
					},
					{
						label: 'Deployment',
						kind: monaco.languages.CompletionItemKind.Class,
						insertText: [
							'apiVersion: apps/v1',
							'kind: Deployment',
							'metadata:',
							'  name: ${1:my-deployment}',
							'  namespace: ${2:default}',
							'spec:',
							'  replicas: ${3:3}',
							'  selector:',
							'    matchLabels:',
							'      app: ${4:my-app}',
							'  template:',
							'    metadata:',
							'      labels:',
							'        app: ${4:my-app}',
							'    spec:',
							'      containers:',
							'      - name: ${5:container-name}',
							'        image: ${6:nginx:latest}',
							'        ports:',
							'        - containerPort: ${7:80}',
						].join('\n'),
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: 'Create a Deployment resource',
						range,
					},
					{
						label: 'Service',
						kind: monaco.languages.CompletionItemKind.Class,
						insertText: [
							'apiVersion: v1',
							'kind: Service',
							'metadata:',
							'  name: ${1:my-service}',
							'  namespace: ${2:default}',
							'spec:',
							'  selector:',
							'    app: ${3:my-app}',
							'  ports:',
							'  - protocol: TCP',
							'    port: ${4:80}',
							'    targetPort: ${5:80}',
							'  type: ${6:ClusterIP}',
						].join('\n'),
						insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
						documentation: 'Create a Service resource',
						range,
					},
				];

				return { suggestions };
			},
		});

		// Set editor options for better YAML editing
		editor.updateOptions({
			tabSize: 2,
			insertSpaces: true,
			detectIndentation: false,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			fontSize: 14,
			lineHeight: 20,
			folding: true,
			wordWrap: 'on',
			automaticLayout: true,
		});
	};

	const handleEditorChange = (value: string | undefined) => {
		if (value !== undefined) {
			onChange(value);
		}
	};

	return (
		<div className={`border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden ${className}`}>
			<Editor
				height={height}
				defaultLanguage="yaml"
				value={value}
				onChange={handleEditorChange}
				onMount={handleEditorDidMount}
				options={{
					readOnly,
					theme: 'vs-dark', // You can make this dynamic based on dark mode
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					fontSize: 14,
					lineHeight: 20,
					tabSize: 2,
					insertSpaces: true,
					wordWrap: 'on',
					automaticLayout: true,
					folding: true,
				}}
			/>
		</div>
	);
};

export default YamlEditor;
