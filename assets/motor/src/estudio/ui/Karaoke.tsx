import React from 'react';
import {ramp, type Film, type Page} from '../film';

const FONT = 'Figtree';
const ENTER = 0.13;
const FADE = 0.09;

const Selection: React.FC<{u: number}> = ({u}) => {
	if (u <= 0) return null;
	const handle = (style: React.CSSProperties): React.CSSProperties => ({position: 'absolute', width: 15, height: 15, borderRadius: 8, background: '#2f74ff', border: '2.5px solid #ffffff', transform: `scale(${u})`, ...style});
	return (
		<>
			<div style={{position: 'absolute', left: -10, right: -10, top: 2, bottom: 2, border: '3px solid #2f74ff', borderRadius: 3, background: 'rgba(47,86,255,0.2)', clipPath: `inset(-4px ${(1 - u) * 100}% -4px -4px)`}} />
			<div style={handle({left: -18, top: -6})} />
			<div style={handle({right: -18, bottom: -6})} />
		</>
	);
};

const Word: React.FC<{text: string; start: number; end: number; next: number; isKey: boolean; t: number}> = ({text, start, next, isKey, t}) => {
	const shown = ramp(t, start - 0.06, start + ENTER - 0.06);
	if (shown <= 0) return <span style={{opacity: 0, display: 'inline-block', fontWeight: 700, whiteSpace: 'pre'}}>{text}</span>;
	const active = isKey || t < next;
	const color = active ? '#ffffff' : 'rgba(150,154,162,0.86)';
	return (
		<span style={{position: 'relative', display: 'inline-grid', whiteSpace: 'pre'}}>
			<span style={{gridArea: '1 / 1', fontWeight: 700, visibility: 'hidden'}}>{text}</span>
			{isKey ? <Selection u={ramp(t, start + 0.1, start + 0.24)} /> : null}
			<span style={{position: 'relative', gridArea: '1 / 1', textAlign: 'center', fontWeight: active ? 700 : 500, color, opacity: shown, filter: shown < 1 ? `blur(${(1 - shown) * 9}px)` : undefined, textShadow: '0 2px 16px rgba(0,0,0,.7), 0 0 3px rgba(0,0,0,.45)'}}>
				{text}
			</span>
		</span>
	);
};

const PageView: React.FC<{page: Page; film: Film; t: number}> = ({page, film, t}) => {
	const opacity = Math.min(ramp(t, page.start, page.start + 0.04), 1 - ramp(t, page.end - FADE, page.end));
	return (
		<div style={{position: 'absolute', left: 150, right: 150, top: 318, textAlign: 'center', fontFamily: FONT, fontSize: 72, lineHeight: '85px', wordSpacing: '0.07em', opacity}}>
			{page.words.map((i, k) => {
				const word = film.words[i];
				const next = film.words[page.words[k + 1]]?.start ?? page.end;
				return (
					<React.Fragment key={i}>
						<Word text={word.word} start={word.start} end={word.end} next={next} isKey={page.key === i} t={t} />{' '}
					</React.Fragment>
				);
			})}
		</div>
	);
};

export const Karaoke: React.FC<{film: Film; t: number}> = ({film, t}) => (
	<>
		{film.pages.map((page, i) => (t >= page.start && t <= page.end ? <PageView key={i} page={page} film={film} t={t} /> : null))}
	</>
);
