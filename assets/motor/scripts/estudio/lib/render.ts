// Turns scene programs into pictures. The bundle is built once: programs travel as data, so a new attempt never rebuilds.
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {rmSync} from 'node:fs';
import path from 'node:path';
import type {Assembly, Film} from '../../../src/estudio/film';
import {navegador} from '../../lib/local';

const chromiumOptions = {gl: navegador().gl};
const browserExecutable = navegador().ejecutable;

export type Renderer = Awaited<ReturnType<typeof openRenderer>>;

export const openRenderer = async () => {
	const serveUrl = await bundle({entryPoint: path.resolve('src/estudio/index.ts'), onProgress: () => undefined});
	const browser = await openBrowser('chrome', {chromiumOptions, browserExecutable});
	const logs: string[] = [];
	const onBrowserLog = ({type, text}: {type: string; text: string}) => {
		if ((type === 'error' || /Shader Error|THREE\.WebGLProgram/.test(text)) && !/favicon|deprecated/i.test(text)) logs.push(text.slice(0, 400));
	};
	const compositionFor = (film: Film, shotId: string) => selectComposition({serveUrl, id: 'Escena', inputProps: {film, shotId}, puppeteerInstance: browser, chromiumOptions, browserExecutable, logLevel: 'error'});

	const stills = async (film: Film, shotId: string, seconds: number[], prefix: string) => {
		const composition = await compositionFor(film, shotId);
		const shot = film.shots.find((s) => s.id === shotId)!;
		const files: string[] = [];
		logs.length = 0;
		for (const [i, s] of seconds.entries()) {
			const frame = Math.max(0, Math.min(composition.durationInFrames - 1, Math.round((s - shot.start) * composition.fps)));
			const output = `${prefix}_${i}.jpg`;
			await renderStill({composition, serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 88, inputProps: {film, shotId}, puppeteerInstance: browser, chromiumOptions, browserExecutable, overwrite: true, timeoutInMilliseconds: 90000, onBrowserLog, logLevel: 'error'});
			files.push(output);
		}
		return {files, logs: [...logs]};
	};

	const clip = async (film: Film, shotId: string, output: string) => {
		const composition = await compositionFor(film, shotId);
		await renderMedia({composition, serveUrl, codec: 'h264', crf: 15, outputLocation: output, inputProps: {film, shotId}, puppeteerInstance: browser, chromiumOptions, browserExecutable, concurrency: 1, timeoutInMilliseconds: 120000, overwrite: true, logLevel: 'error'});
		return output;
	};

	const assemble = async (assembly: Assembly, output: string) => {
		const composition = await selectComposition({serveUrl, id: 'Montaje', inputProps: {assembly}, puppeteerInstance: browser, chromiumOptions, browserExecutable, logLevel: 'error'});
		await renderMedia({composition, serveUrl, codec: 'h264', crf: 16, outputLocation: output, inputProps: {assembly}, puppeteerInstance: browser, chromiumOptions, browserExecutable, concurrency: 2, timeoutInMilliseconds: 120000, overwrite: true, logLevel: 'error'});
		return output;
	};

	// Each bundle copies public/ into the temp folder, which may live in memory.
	const close = async () => {
		await browser.close({silent: true});
		rmSync(serveUrl, {recursive: true, force: true});
	};
	return {stills, clip, assemble, close};
};
