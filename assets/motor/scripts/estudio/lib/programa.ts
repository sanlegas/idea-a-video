// Decides if a scene program written by a model may run, and compiles it. Nothing reaches the browser without passing here.
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const API = path.resolve('src/estudio/kit/api.d.ts');
// Plantillas tomas compile against their own, smaller API.
export const TOMAS_API = path.resolve('src/kit/world/tomas/api.d.ts');
const WORK = path.resolve('out/estudio/check');

const FORBIDDEN_NAMES = new Set(['window', 'document', 'globalThis', 'self', 'parent', 'top', 'frames', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB', 'eval', 'Function', 'require', 'process', 'module', 'exports', 'Reflect', 'Proxy', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'Date', 'performance', 'crypto', 'importScripts']);
const FORBIDDEN_MEMBERS = new Set(['constructor', '__proto__', 'prototype', 'ownerDocument', 'defaultView', 'random']);
const SAFE_MEMBER_OWNERS = new Set(['random']);

const place = (source: ts.SourceFile, node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

// A scene may only build and pose things. Anything that reaches outside the kit is refused before running.
const lint = (source: ts.SourceFile) => {
	const issues: string[] = [];
	const refuse = (node: ts.Node, why: string) => issues.push(`línea ${place(source, node)}: ${why}`);
	const visit = (node: ts.Node) => {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node) || ts.isImportEqualsDeclaration(node)) refuse(node, 'no uses import ni export; THREE y kit ya están disponibles');
		if (node.kind === ts.SyntaxKind.ImportKeyword) refuse(node, 'import dinámico no permitido');
		if (ts.isIdentifier(node) && FORBIDDEN_NAMES.has(node.text)) {
			const parent = node.parent;
			const isMember = ts.isPropertyAccessExpression(parent) && parent.name === node;
			const isKey = ts.isPropertyAssignment(parent) && parent.name === node;
			if (!isMember && !isKey) refuse(node, `${node.text} no existe en una escena`);
		}
		if (ts.isPropertyAccessExpression(node) && FORBIDDEN_MEMBERS.has(node.name.text)) {
			const math = ts.isIdentifier(node.expression) && node.expression.text === 'Math';
			if (!SAFE_MEMBER_OWNERS.has(node.name.text) || math) refuse(node, `${node.getText(source)} no permitido; para azar usa random(semilla)`);
		}
		if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && (FORBIDDEN_MEMBERS.has(node.argumentExpression.text) || FORBIDDEN_NAMES.has(node.argumentExpression.text))) refuse(node, 'acceso por texto no permitido');
		if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') refuse(node, 'Function no permitido');
		ts.forEachChild(node, visit);
	};
	visit(source);
	return issues;
};

const OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
	strict: false,
	noEmit: true,
	skipLibCheck: true,
	types: [],
	typeRoots: [],
};

const oldPrograms = new Map<string, ts.Program>();

const typeCheck = (code: string, api: string) => {
	mkdirSync(WORK, {recursive: true});
	const file = path.join(WORK, 'escena.ts');
	// THREE arrives as a value at run time; this line only lets the program name its types too.
	writeFileSync(file, `import type * as THREE from 'three';\n${code}`);
	// three's types are found from the project root, which holds node_modules.
	const host = ts.createCompilerHost({...OPTIONS, baseUrl: process.cwd(), paths: {three: ['node_modules/@types/three']}});
	const program = ts.createProgram([api, file], {...OPTIONS, baseUrl: process.cwd(), paths: {three: ['node_modules/@types/three']}}, host, oldPrograms.get(api));
	oldPrograms.set(api, program);
	const source = program.getSourceFile(file)!;
	const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
	return diagnostics.slice(0, 12).map((d) => {
		const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line : 0;
		return `línea ${line}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 220)}`;
	});
};

export type Checked = {js: string | null; issues: string[]};

export const checkProgram = (code: string, api = API): Checked => {
	const source = ts.createSourceFile('escena.ts', code, ts.ScriptTarget.ES2022, true);
	const issues = lint(source);
	if (issues.length) return {js: null, issues};
	const types = typeCheck(code, api);
	if (types.length) return {js: null, issues: types};
	const {outputText} = ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None}});
	return {js: outputText, issues: []};
};

export const apiText = (api = API) => ts.sys.readFile(api) ?? '';
