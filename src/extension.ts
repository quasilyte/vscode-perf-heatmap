import * as vscode from 'vscode';
import * as fs from 'fs';

require('./main');

let heatmapThreshold = 0.75; // TODO: make configurable

interface HeatmapLineStats {
	line: number;
	localLevel: number;
	globalLevel: number;
	value: number;
}

declare class PerfheatmapInterface {
	public createIndex(indexKey: string, profileText: Buffer, threshold: number): string;
	public deleteIndex(indexKey: string): void;
	public hasIndex(indexKey: string): boolean;
	public getFileLevels(indexKey: string, filename: string): HeatmapLineStats[] | string;
}

declare var perfheatmap: PerfheatmapInterface;

export function activate(ctx: vscode.ExtensionContext) {
	const registerCommand = function (command: string, callback: (...args: any[]) => any) {
		ctx.subscriptions.push(vscode.commands.registerCommand(command, callback));
	};

	registerCommand('perf-heatmap.loadProfile', cmdLoadProfile);
	registerCommand('perf-heatmap.annotateLocalLevels', cmdAnnotateLocalLevels);
	registerCommand('perf-heatmap.annotateGlobalLevels', cmdAnnotateGlobalLevels);

	decorationTypes = createDecorationTypes(ctx);
}

function createDecorationTypes(ctx: vscode.ExtensionContext): vscode.TextEditorDecorationType[] {
	let m: vscode.TextEditorDecorationType[] = [];
	for (let level = 1; level <= 5; level++) {
		const relPath = `assets/gutter-${level}.png`;
		const d = vscode.window.createTextEditorDecorationType({
			gutterIconPath: ctx.asAbsolutePath(relPath),
		})
		m.push(d);
	}
	return m;
}

let decorationTypes: vscode.TextEditorDecorationType[];

async function cmdLoadProfile() {
	const options: vscode.OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Open',
		filters: {
			'All files': ['*']
		},
	};

	vscode.window.showOpenDialog(options).then(fileUri => {
		if (!fileUri || !fileUri[0]) {
			return;
		}
		let selectedFile = fileUri[0].fsPath;
		fs.readFile(selectedFile, null, (readErr, fileBytes) => {
			if (readErr) {
				vscode.window.showErrorMessage(`open profile: ${readErr.message}`);
				return;
			}
			let err = perfheatmap.createIndex('profile', fileBytes, heatmapThreshold);
			if (err) {
				vscode.window.showErrorMessage(`parse profile: ${err}`);
				return
			}
			vscode.window.showInformationMessage('profile is loaded successfully');
		});
	});
}

async function cmdAnnotateLocalLevels() {
	vscode.window.visibleTextEditors.forEach((e) => {
		if (!e.document.fileName.endsWith('.go')) {
			return;
		}
		applyDecorators(e, true);
	});
}

async function cmdAnnotateGlobalLevels() {
	vscode.window.visibleTextEditors.forEach((e) => {
		if (!e.document.fileName.endsWith('.go')) {
			return;
		}
		applyDecorators(e, false);
	});
}

function applyDecorators(editor: vscode.TextEditor, local: boolean) {
	let fileData = perfheatmap.getFileLevels('profile', editor.document.fileName);
	if (typeof fileData === 'string') {
		vscode.window.showErrorMessage(`read profile: ${fileData}`);
		return;
	}
	
	let toSet = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
	for (let stats of fileData) {
		let level = (local ? stats.localLevel : stats.globalLevel);
		if (level === 0) {
			continue;
		}
		let seconds = stats.value * 0.0001;
		let d = decorationTypes[level - 1];
		if (!d) {
			vscode.window.showErrorMessage(`can't find decorator for ${level - 1}`);
			return;
		}
		let options = {
			range: editor.document.lineAt(stats.line - 1).range,
			hoverMessage: `heat levels: local=${stats.localLevel} global=${stats.globalLevel} (${seconds.toFixed(2)}s)`,
		};
		let list = toSet.get(d);
		if (list) {
			list.push(options);
			toSet.set(d, list);
		} else {
			toSet.set(d, [options]);
		}
	}

	for (let [typ, optionsList] of toSet) {
		editor.setDecorations(typ, optionsList);
	}
}
