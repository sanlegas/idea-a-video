// Single frames of the Plantillas world, for checking tomas. The bundle is built once; each film travels as data.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import {rmSync} from 'node:fs';
import path from 'node:path';
import type {Film} from '../../src/schema';
import {navegador} from './local';

const chromiumOptions = {gl: navegador().gl};
const browserExecutable = navegador().ejecutable;

export type WorldRenderer = Awaited<ReturnType<typeof openWorldRenderer>>;

export const openWorldRenderer = async () => {
	const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), onProgress: () => undefined});
	const browser = await openBrowser('chrome', {chromiumOptions, browserExecutable});
	const logs: string[] = [];
	const onBrowserLog = ({type, text}: {type: string; text: string}) => {
		if ((type === 'error' || /Shader Error|THREE\.WebGLProgram/.test(text)) && !/favicon|deprecated|Failed to load resource/i.test(text)) logs.push(text.slice(0, 400));
	};

	// Frames at the given seconds. A toma that throws shows up as an error here, not as a broken film later.
	const stills = async (film: Film, seconds: number[], prefix: string) => {
		const inputProps = {film};
		const composition = await selectComposition({serveUrl, id: 'Pilot', inputProps, puppeteerInstance: browser, chromiumOptions, browserExecutable, logLevel: 'error'});
		const files: string[] = [];
		logs.length = 0;
		for (const [i, s] of seconds.entries()) {
			const output = `${prefix}_${i}.jpg`;
			const frame = Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(s * composition.fps)));
			await renderStill({composition, serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 85, inputProps, puppeteerInstance: browser, chromiumOptions, browserExecutable, overwrite: true, timeoutInMilliseconds: 120000, onBrowserLog, logLevel: 'error'});
			files.push(output);
		}
		return {files, logs: [...logs]};
	};

	const close = async () => {
		await browser.close({silent: true});
		rmSync(serveUrl, {recursive: true, force: true});
	};
	return {stills, close};
};
