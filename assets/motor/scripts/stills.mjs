// Fast look at chosen seconds without rebuilding: node scripts/stills.mjs <out-prefix> <sec> <sec> ...
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';

const [prefix, ...secs] = process.argv.slice(2);
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), onProgress: () => undefined});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'angle'}});
const composition = await selectComposition({serveUrl, id: 'Pilot', puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}});
for (const s of secs) {
	const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
	const t0 = Date.now();
	await renderStill({composition, serveUrl, frame, output: `${prefix}_${s}.jpg`, imageFormat: 'jpeg', jpegQuality: 88, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, overwrite: true});
	console.log(s, Date.now() - t0, 'ms');
}
await browser.close({silent: true});
