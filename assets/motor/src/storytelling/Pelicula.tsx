// Generic render of a storytelling film: staged scenes, narrator phrases and graphic cards, with captions that
// follow each narrated word. How shots enter, how the camera moves, where focus goes and how captions look come
// from the film's style (formato.ts, estilo.ts); a film without style renders with hard cuts and a slow push-in.
import React from 'react';
import {AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {backOut, easeOut3, ramp, smooth, type Word} from '../estudio/film';
import {ENCUADRES, limpia, LOOKS, norma, paginas, TEXTO_BASE, TRANSICIONES, type Camara, type Grado, type Look, type Pelicula, type Plano, type PlanoEscena, type PlanoLamina, type PlanoNarrador, type Texto} from './formato';

const GROTESCA = 'Figtree';
const MARCADOR = 'Barlow Condensed';

// Repeatable noise from a number: the same frame always gets the same value, so renders match.
const azar = (n: number) => {
	const x = Math.sin(n * 127.1 + 11.7) * 43758.5453;
	return x - Math.floor(x);
};

// Film grain as one small tile the browser paints once; it jumps every frame, as grain does.
const GRANO = `url("data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`;

const Grano: React.FC<{fuerza?: number}> = ({fuerza = 0.16}) => {
	const frame = useCurrentFrame();
	return <AbsoluteFill style={{backgroundImage: GRANO, backgroundPosition: `${Math.round(azar(frame) * 220)}px ${Math.round(azar(frame + 0.5) * 220)}px`, opacity: fuerza, mixBlendMode: 'overlay', pointerEvents: 'none'}} />;
};

// Printed dots, as in a photocopied press photo.
const Semitono: React.FC<{fuerza?: number}> = ({fuerza = 0.5}) => <AbsoluteFill style={{backgroundImage: `radial-gradient(circle, rgba(0,0,0,${fuerza}) 1.7px, transparent 2.1px)`, backgroundSize: '7px 7px', mixBlendMode: 'multiply', pointerEvents: 'none'}} />;

const Vineta: React.FC<{fuerza?: number}> = ({fuerza = 0.6}) => <AbsoluteFill style={{background: `radial-gradient(85% 70% at 50% 45%, transparent 45%, rgba(0,0,0,${fuerza}) 100%)`, pointerEvents: 'none'}} />;

// Defined once per film. rugoso roughens type so it reads as written with a marker; the two barridos smear a shot
// sideways only, which is what a fast pan looks like.
const Filtros: React.FC = () => (
	<svg width="0" height="0" style={{position: 'absolute'}}>
		<filter id="rugoso" x="-10%" y="-20%" width="120%" height="140%">
			<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="r" />
			<feDisplacementMap in="SourceGraphic" in2="r" scale="7" xChannelSelector="R" yChannelSelector="G" />
		</filter>
		<filter id="barrido1" x="-10%" y="0" width="120%" height="100%">
			<feGaussianBlur stdDeviation="22 0" />
		</filter>
		<filter id="barrido2" x="-20%" y="0" width="140%" height="100%">
			<feGaussianBlur stdDeviation="58 0" />
		</filter>
	</svg>
);

// Word written with a marker: on paper, ink over an orange stroke; on dark looks, the accent colour glowing.
const Marcador: React.FC<{texto: string; look: Look; u: number; size?: number}> = ({texto, look, u, size}) => (
	<span style={{position: 'relative', display: 'inline-block', fontFamily: MARCADOR, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.01em', fontSize: size, lineHeight: 1, transform: 'rotate(-2deg)', filter: look.oscuro ? undefined : 'url(#rugoso)', padding: '0 .12em'}}>
		{look.oscuro ? null : <span style={{position: 'absolute', left: 0, right: 0, top: '8%', bottom: '4%', background: look.acento, transformOrigin: 'left', transform: `scaleX(${u})`}} />}
		{/* On dark looks the glow stays faint and wide so the letter edges stay sharp. */}
		<span style={{position: 'relative', color: look.oscuro ? look.acento : look.tinta, textShadow: look.oscuro ? `0 0 18px ${look.acento}55, 0 2px 0 rgba(0,0,0,.35)` : undefined}}>{texto}</span>
	</span>
);

// Ring of hard shadows: a thick outline that works in every browser build.
const borde = (r: number, color: string) => Array.from({length: 16}, (_, k) => `${(Math.cos((k * Math.PI) / 8) * r).toFixed(1)}px ${(Math.sin((k * Math.PI) / 8) * r).toFixed(1)}px 0 ${color}`).join(', ');

// Captions of one shot. `texto` says how they look (estilo), when each word shows (aparece) and, over photographs,
// where they sit; sobreFoto is false on cards, where the type takes the colours of the look.
const Subtitulos: React.FC<{p: Plano; palabras: Word[]; t: number; modo: 'linea' | 'bloque'; texto: Texto; look: Look; sobreFoto: boolean; size: number; clave?: Set<string>; style: React.CSSProperties}> = ({p, palabras, t, modo, texto, look, sobreFoto, size, clave, style}) => {
	const pagina = paginas(palabras, p, modo).find((g) => t >= g.desde && t < g.hasta);
	if (!pagina) return null;
	const {estilo, aparece} = texto;
	const tinta = sobreFoto ? '#fff' : look.tinta;
	const brillo = sobreFoto || look.oscuro ? look.brillo : 'transparent';
	// The word being said: the last one of the page that has started.
	const activa = [...pagina.palabras].reverse().find((i) => t >= palabras[i].start - 0.04) ?? pagina.palabras[0];
	const bloque = estilo === 'bloque';
	const px = size * (bloque ? 1.24 : 1);
	const sombra = bloque && sobreFoto ? `${borde(px * 0.085, '#000')}, 0 ${px * 0.12}px ${px * 0.2}px rgba(0,0,0,.6)` : estilo === 'caja' ? 'none' : `0 0 22px ${brillo}, 0 2px 10px rgba(0,0,0,${sobreFoto ? 0.55 : 0})`;
	const fuente: React.CSSProperties = bloque ? {fontFamily: MARCADOR, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.005em', wordSpacing: '0.14em', lineHeight: 1.04} : {fontFamily: GROTESCA, fontWeight: estilo === 'caja' ? 800 : 700, letterSpacing: '-0.045em', lineHeight: estilo === 'caja' ? 1.32 : 1.04};
	const caja = estilo === 'caja' ? (sobreFoto ? 'rgba(8,8,10,.8)' : look.oscuro ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.08)') : null;

	if (aparece === 'palabra') {
		const w = palabras[activa];
		const pop = backOut(ramp(t, w.start - 0.04, w.start + 0.1));
		const esClave = clave?.has(norma(w.word));
		return (
			<div style={{position: 'absolute', ...fuente, fontSize: px * (modo === 'linea' ? 1.7 : 1.5), color: esClave ? look.acento : tinta, textShadow: sombra, ...style, textAlign: 'center'}}>
				<span style={{display: 'inline-block', transform: `scale(${0.72 + 0.28 * pop})`, opacity: Math.min(1, pop * 1.6), ...(caja ? {background: look.acento, color: look.oscuro ? '#0b0b0d' : '#fff', padding: '.02em .22em', borderRadius: px * 0.2} : {})}}>{limpia(w.word)}</span>
			</div>
		);
	}

	const entra = backOut(ramp(t, pagina.desde, pagina.desde + 0.14));
	return (
		<div style={{position: 'absolute', ...fuente, fontSize: px, color: tinta, textShadow: sombra, transform: `scale(${0.94 + 0.06 * entra})`, ...style}}>
			<span style={caja ? {background: caja, padding: '.1em .3em', borderRadius: px * 0.22, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'} : undefined}>
				{pagina.palabras.map((i) => {
					const w = palabras[i];
					const dicho = ramp(t, w.start - 0.05, w.start + 0.07);
					const esClave = clave?.has(norma(w.word));
					const suena = i === activa && (aparece === 'karaoke' || estilo === 'caja') && t >= w.start - 0.04;
					const letras = limpia(w.word);
					const s: React.CSSProperties = {display: 'inline-block', fontWeight: esClave ? 900 : undefined};
					if (aparece === 'pagina') s.opacity = estilo === 'contorno' ? 1 : 0.3 + 0.7 * dicho;
					if (aparece === 'acumula') Object.assign(s, {opacity: dicho, transform: `translateY(${(1 - backOut(dicho)) * 16}px) scale(${0.9 + 0.1 * dicho})`});
					if (aparece === 'karaoke') Object.assign(s, {opacity: 0.62 + 0.38 * dicho, transform: suena ? `scale(${1 + 0.06 * backOut(ramp(t, w.start - 0.04, w.start + 0.1))})` : undefined});
					// Hollow letters fill in as the word is said.
					if (estilo === 'contorno' && dicho < 1) Object.assign(s, {color: `rgba(${sobreFoto || look.oscuro ? '255,255,255' : '20,20,20'},${dicho})`, WebkitTextStroke: `${Math.max(2, px * 0.035)}px ${tinta}`, textShadow: 'none'});
					if (suena) Object.assign(s, estilo === 'caja' ? {background: look.acento, color: look.oscuro ? '#0b0b0d' : '#fff', borderRadius: px * 0.16, padding: '0 .14em', margin: '0 -.14em'} : {color: look.acento});
					if (aparece === 'maquina') {
						// Letters come in between the start of the word and its end, with a block cursor after the last one.
						const n = Math.round(letras.length * ramp(t, w.start - 0.02, Math.min(w.end, w.start + 0.22)));
						return (
							<React.Fragment key={i}>
								<span style={s}>
									{letras.slice(0, n)}
									{i === activa ? <span style={{display: 'inline-block', width: '.5em', height: '.82em', marginLeft: '.04em', background: look.acento, verticalAlign: '-0.06em'}} /> : null}
									<span style={{opacity: 0}}>{letras.slice(n + (i === activa ? 1 : 0))}</span>
								</span>{' '}
							</React.Fragment>
						);
					}
					return (
						<React.Fragment key={i}>
							<span style={s}>{letras}</span>{' '}
						</React.Fragment>
					);
				})}
			</span>
		</div>
	);
};

// Stand-in for a picture that does not exist yet (draft runs): a dark plate that says what will be there.
const Pendiente: React.FC<{prompt: string; semilla?: string}> = ({prompt, semilla}) => {
	// Each picture gets its own colour, so a punch-in on the same picture reads apart from a cut to a new one.
	const tono = [...(semilla ?? prompt)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
	return (
		<AbsoluteFill style={{background: `linear-gradient(160deg, hsl(${tono} 34% 24%), hsl(${(tono + 40) % 360} 40% 7%))`}}>
			{prompt ? <div style={{position: 'absolute', left: 50, right: 50, bottom: 90, fontFamily: GROTESCA, fontSize: 28, fontWeight: 500, lineHeight: 1.25, color: 'rgba(255,255,255,.5)'}}>IMAGEN PENDIENTE · {prompt}</div> : null}
		</AbsoluteFill>
	);
};

const FOCO = {arriba: '50% 26%', centro: '50% 50%', abajo: '50% 74%'};

// Camera over a still picture: scale and drift on top of the framing, so no shot ever sits still. u runs 0 to 1 along
// the shot, t is film time. Moves stay inside the margin the scale leaves, so the picture never shows its edge.
const moverCamara = (c: Camara, u: number, t: number) => {
	if (c === 'alejar') return {s: 1.13 - 0.08 * u, x: 0, y: 0, r: 0};
	if (c === 'paneo_der') return {s: 1.1, x: 2.4 - 4.8 * u, y: 0, r: 0};
	if (c === 'paneo_izq') return {s: 1.1, x: -2.4 + 4.8 * u, y: 0, r: 0};
	if (c === 'subir') return {s: 1.1, x: 0, y: -1.1 + 2.2 * u, r: 0};
	if (c === 'bajar') return {s: 1.1, x: 0, y: 1.1 - 2.2 * u, r: 0};
	if (c === 'mano') return {s: 1.08 + 0.02 * u, x: Math.sin(t * 1.3) * 0.9, y: Math.cos(t * 1.1) * 0.7, r: Math.sin(t * 0.8) * 0.35};
	if (c === 'quieta') return {s: 1.02, x: 0, y: 0, r: 0};
	return {s: 1.03 + 0.08 * u, x: 0, y: 0, r: 0};
};

// Colour grade: a filter on the picture, a tint over it and whether bright areas bleed (halo).
const GRADO: Record<Grado, {filtro: string; tinte: string | null; halo: number}> = {
	neutro: {filtro: 'contrast(1.06) saturate(.92)', tinte: null, halo: 0},
	cine: {filtro: 'contrast(1.14) saturate(1.04) brightness(.97)', tinte: 'linear-gradient(170deg, rgba(255,176,96,.34) 0%, rgba(120,120,120,0) 45%, rgba(0,96,120,.42) 100%)', halo: 0.3},
	frio: {filtro: 'contrast(1.12) saturate(.82) brightness(.98)', tinte: 'linear-gradient(175deg, rgba(120,170,255,.3) 0%, rgba(20,60,120,.38) 100%)', halo: 0.26},
	calido: {filtro: 'contrast(1.12) saturate(1.06)', tinte: 'linear-gradient(175deg, rgba(255,170,80,.36) 0%, rgba(150,50,10,.34) 100%)', halo: 0.3},
	bn: {filtro: 'grayscale(1) contrast(1.25) brightness(.96)', tinte: null, halo: 0.18},
};

const TOPE = {alterna: ['17%', '61%'], arriba: ['14%', '14%'], centro: ['43%', '43%'], abajo: ['63%', '63%']};

const Escena: React.FC<{p: PlanoEscena; f: Pelicula; look: Look; indice: number}> = ({p, f, look, indice}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const tl = frame / fps;
	const u = tl / (p.hasta - p.desde);
	const mov = moverCamara(p.camara ?? 'empujar', u, p.desde + tl);
	// The film's first shot is the hook: it opens already close and settles in half a second, so there is motion on
	// frame 0 and nothing to wait for.
	const cam = indice === 0 ? {...mov, s: mov.s + 0.14 * (1 - easeOut3(ramp(tl, 0, 0.5)))} : mov;
	const viejo = p.tratamiento === 'archivo';
	const g = GRADO[viejo ? 'neutro' : (f.grado ?? 'neutro')];
	const enfoque = p.enfoque ?? 'fijo';
	// Focus pull: the shot opens soft and finds its subject.
	const suave = enfoque === 'entrar' && indice > 0 ? 16 * (1 - easeOut3(ramp(tl, 0, 0.42))) : 0;
	const filtro = `${viejo ? 'grayscale(1) sepia(.38) contrast(1.18) brightness(.95)' : g.filtro}${suave > 0.3 ? ` blur(${suave.toFixed(1)}px)` : ''}`;
	const lleno: React.CSSProperties = {position: 'absolute', width: '100%', height: '100%', objectFit: 'cover'};
	const texto: Texto = {...TEXTO_BASE, ...f.texto, ...p.texto};
	const centrado = texto.posicion !== 'alterna';
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<AbsoluteFill style={{transform: `translate(${cam.x}%, ${cam.y}%) rotate(${cam.r}deg) scale(${ENCUADRES[p.encuadre] * cam.s})`, transformOrigin: FOCO[p.foco]}}>
				{p.imagen ? (
					<>
						<Img src={staticFile(p.imagen)} style={{...lleno, filter: filtro}} />
						{/* Open lens: a soft copy everywhere but around the point of focus, which widens as the shot goes. */}
						{enfoque === 'selectivo' ? <Img src={staticFile(p.imagen)} style={{...lleno, filter: `${viejo ? 'grayscale(1) sepia(.38) contrast(1.18) brightness(.95)' : g.filtro} blur(11px)`, WebkitMaskImage: `radial-gradient(ellipse ${46 + 10 * u}% ${30 + 6 * u}% at ${FOCO[p.foco]}, transparent 55%, #000 100%)`, maskImage: `radial-gradient(ellipse ${46 + 10 * u}% ${30 + 6 * u}% at ${FOCO[p.foco]}, transparent 55%, #000 100%)`}} /> : null}
						{/* Halation: bright areas bleed into their surroundings, as on film. */}
						{g.halo ? <Img src={staticFile(p.imagen)} style={{...lleno, filter: 'blur(30px) brightness(1.25) saturate(1.3)', mixBlendMode: 'screen', opacity: g.halo}} /> : null}
					</>
				) : (
					<Pendiente prompt="" semilla={p.prompt} />
				)}
			</AbsoluteFill>
			{p.imagen ? null : <div style={{position: 'absolute', left: 70, right: 70, bottom: 150, fontFamily: GROTESCA, fontSize: 30, fontWeight: 500, lineHeight: 1.25, color: 'rgba(255,255,255,.5)'}}>IMAGEN PENDIENTE · {p.encuadre}, foco {p.foco} · {p.prompt}</div>}
			{g.tinte && p.imagen ? <AbsoluteFill style={{background: g.tinte, mixBlendMode: 'soft-light'}} /> : null}
			{viejo ? <Semitono fuerza={0.42} /> : null}
			<Vineta fuerza={viejo ? 0.45 : 0.7} />
			<Grano />
			<Subtitulos p={p} palabras={f.palabras} t={p.desde + tl} modo="bloque" texto={texto} look={look} sobreFoto size={56} style={centrado ? {left: 80, right: 80, top: TOPE[texto.posicion][0], textAlign: 'center'} : {left: 86, width: 700, top: TOPE.alterna[indice % 2], textAlign: 'left'}} />
		</AbsoluteFill>
	);
};

const Narrador: React.FC<{p: PlanoNarrador; f: Pelicula; look: Look}> = ({p, f, look}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const tl = frame / fps;
	const escala = ENCUADRES[p.encuadre] * (1 + 0.025 * (tl / (p.hasta - p.desde)));
	// Hand-held drift: the room never locks off.
	const dx = Math.sin((p.desde + tl) * 0.9) * 9;
	const dy = Math.cos((p.desde + tl) * 0.7) * 7;
	const g = GRADO[f.grado ?? 'neutro'];
	const texto: Texto = {...TEXTO_BASE, ...f.texto, ...p.texto};
	return (
		<AbsoluteFill style={{background: look.ambiente[1]}}>
			<AbsoluteFill style={{transform: `translate(${dx}px, ${dy}px) scale(${escala})`, transformOrigin: '62% 42%'}}>
				{f.ambiente ? (
					<Img src={staticFile(f.ambiente)} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(7px) brightness(.62)'}} />
				) : (
					<AbsoluteFill style={{background: `radial-gradient(95% 62% at 58% 40%, ${look.ambiente[0]} 0%, ${look.ambiente[1]} 78%)`}}>
						<div style={{position: 'absolute', left: '70%', top: '36%', width: 420, height: 520, borderRadius: '50%', background: look.lampara, opacity: 0.3, filter: 'blur(120px)'}} />
						<div style={{position: 'absolute', left: '77%', top: '41%', width: 104, height: 138, borderRadius: '50%', background: look.lampara, filter: 'blur(20px)'}} />
						<div style={{position: 'absolute', left: '11%', top: '23%', width: 44, height: 44, borderRadius: '50%', background: look.lampara, opacity: 0.32, filter: 'blur(14px)'}} />
						<div style={{position: 'absolute', left: 0, right: 0, top: '70%', bottom: 0, background: 'linear-gradient(transparent, rgba(0,0,0,.72))'}} />
					</AbsoluteFill>
				)}
			</AbsoluteFill>
			{g.tinte && f.ambiente ? <AbsoluteFill style={{background: g.tinte, mixBlendMode: 'soft-light'}} /> : null}
			<Vineta fuerza={0.75} />
			<Grano />
			<Subtitulos p={p} palabras={f.palabras} t={p.desde + tl} modo="linea" texto={texto} look={look} sobreFoto size={82} style={{left: 90, right: 90, top: '45%', textAlign: 'center'}} />
		</AbsoluteFill>
	);
};

// Card background: creased paper, or black with a thin frame.
const FondoLamina: React.FC<{look: Look; children: React.ReactNode}> = ({look, children}) => (
	<AbsoluteFill style={{background: look.fondo, overflow: 'hidden'}}>
		{look.oscuro ? (
			<>
				<AbsoluteFill style={{background: `radial-gradient(70% 50% at 50% 46%, ${look.acento}1f 0%, transparent 70%)`}} />
				<div style={{position: 'absolute', left: 54, right: 54, top: 120, bottom: 120, border: `2px solid ${look.tinta}26`}} />
			</>
		) : (
			<AbsoluteFill style={{background: 'linear-gradient(103deg, transparent 31%, rgba(0,0,0,.05) 32%, transparent 34%), linear-gradient(8deg, transparent 57%, rgba(255,255,255,.5) 58%, transparent 61%), linear-gradient(74deg, transparent 68%, rgba(0,0,0,.04) 69%, transparent 71%)'}} />
		)}
		{children}
		<Grano fuerza={look.oscuro ? 0.14 : 0.3} />
	</AbsoluteFill>
);

// Picture cut out by blending: on paper, white vanishes (multiply); on black, black vanishes (screen).
const Recorte: React.FC<{imagen?: string | null; prompt?: string; look: Look; style: React.CSSProperties}> = ({imagen, prompt, look, style}) => (
	<div style={{position: 'absolute', ...style}}>
		{imagen ? (
			<>
				{look.oscuro ? <Img src={staticFile(imagen)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'screen', filter: 'grayscale(1) blur(22px) brightness(1.5)', opacity: 0.7}} /> : null}
				<Img src={staticFile(imagen)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: look.oscuro ? 'screen' : 'multiply', filter: look.oscuro ? 'grayscale(1) contrast(1.2) brightness(1.15)' : 'grayscale(1) contrast(1.35) sepia(.2)'}} />
			</>
		) : (
			<div style={{position: 'absolute', inset: '8%', borderRadius: '50%', border: `4px dashed ${look.suave}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 50, textAlign: 'center', fontFamily: GROTESCA, fontSize: 28, fontWeight: 500, color: look.suave}}>IMAGEN PENDIENTE · {prompt}</div>
		)}
	</div>
);

const Lamina: React.FC<{p: PlanoLamina; f: Pelicula; look: Look}> = ({p, f, look}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const tl = frame / fps;
	const t = p.desde + tl;
	const u = tl / (p.hasta - p.desde);
	const clave = new Set(p.clave.map(norma));
	// Under a card the caption keeps the film's way of appearing; one word at a time would fight the card itself.
	const base: Texto = {...TEXTO_BASE, ...f.texto, ...p.texto};
	const texto: Texto = {...base, aparece: base.aparece === 'palabra' ? 'karaoke' : base.aparece};
	const pie = <Subtitulos p={p} palabras={f.palabras} t={t} modo="bloque" texto={texto} look={look} sobreFoto={false} size={54} clave={clave} style={{left: 96, right: 96, top: '71%', textAlign: 'left'}} />;

	if (p.bloque === 'titular') {
		const n = p.ultima - p.primera + 1;
		const size = n <= 4 ? 168 : n <= 8 ? 128 : 98;
		return (
			<FondoLamina look={look}>
				<div style={{position: 'absolute', left: 84, right: 70, top: n <= 4 ? '34%' : '24%', fontFamily: GROTESCA, fontSize: size, fontWeight: 800, letterSpacing: '-0.055em', lineHeight: 0.98, color: look.tinta, textShadow: look.oscuro ? `0 0 34px ${look.brillo}` : undefined, transform: `translateX(${-26 * u}px) scale(${1 + 0.035 * u})`, transformOrigin: 'left center'}}>
					{f.palabras.slice(p.primera, p.ultima + 1).map((w, k) => {
						const s = backOut(ramp(t, w.start - 0.04, w.start + 0.16));
						const esClave = clave.has(norma(w.word));
						return (
							<React.Fragment key={k}>
								<span style={{display: 'inline-block', opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 34}px)`, filter: s < 0.98 ? `blur(${((1 - Math.min(1, s)) * 12).toFixed(1)}px)` : undefined}}>
									{esClave ? <Marcador texto={limpia(w.word)} look={look} u={smooth(ramp(t, w.start + 0.05, w.start + 0.3))} size={size * 1.12} /> : limpia(w.word)}
								</span>{' '}
							</React.Fragment>
						);
					})}
				</div>
				<div style={{position: 'absolute', left: 84, top: '19%', height: 5, width: 300 * easeOut3(ramp(tl, 0, 0.5)), background: look.tinta}} />
			</FondoLamina>
		);
	}

	if (p.bloque === 'dato') {
		const valor = p.valor ?? 0;
		const cuenta = valor * easeOut3(ramp(tl, 0.12, 1.0));
		const texto = (Number.isInteger(valor) ? Math.round(cuenta) : cuenta).toLocaleString('es-MX', {maximumFractionDigits: Number.isInteger(valor) ? 0 : 1});
		const R = 330;
		const largo = 2 * Math.PI * R;
		return (
			<FondoLamina look={look}>
				{p.sufijo === '%' ? (
					<svg width={WIDTH_RING} height={WIDTH_RING} viewBox="-400 -400 800 800" style={{position: 'absolute', left: (1080 - WIDTH_RING) / 2, top: 330}}>
						<circle r={R} fill="none" stroke={`${look.tinta}22`} strokeWidth={26} />
						<circle r={R} fill="none" stroke={look.acento} strokeWidth={26} strokeDasharray={`${(largo * cuenta) / 100} ${largo}`} transform="rotate(-90)" style={{filter: look.oscuro ? `drop-shadow(0 0 18px ${look.acento})` : undefined}} />
					</svg>
				) : null}
				<div style={{position: 'absolute', left: 0, right: 0, top: 560, textAlign: 'center', fontFamily: GROTESCA, fontSize: 270, fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 1, color: look.tinta, textShadow: look.oscuro ? `0 0 40px ${look.brillo}` : undefined}}>
					{p.prefijo ?? ''}
					{texto}
					<span style={{fontSize: 150}}>{p.sufijo ?? ''}</span>
				</div>
				{p.etiqueta ? (
					<div style={{position: 'absolute', left: 0, right: 0, top: 1130, textAlign: 'center', opacity: ramp(tl, 0.5, 0.75)}}>
						<Marcador texto={p.etiqueta} look={look} u={smooth(ramp(tl, 0.55, 0.9))} size={84} />
					</div>
				) : null}
				{pie}
			</FondoLamina>
		);
	}

	if (p.bloque === 'cita') {
		const entra = easeOut3(ramp(tl, 0, 0.35));
		return (
			<FondoLamina look={look}>
				<div style={{position: 'absolute', left: 96, right: 96, top: 330, height: 760, borderRadius: 40, overflow: 'hidden', background: look.oscuro ? '#15130f' : '#d9d2c3', boxShadow: look.oscuro ? `0 0 70px ${look.acento}33` : '0 24px 50px rgba(0,0,0,.22)', transform: `scale(${0.94 + 0.06 * entra + 0.02 * u})`, opacity: entra}}>
					{p.imagen ? (
						<Img src={staticFile(p.imagen)} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(1) sepia(.35) contrast(1.15)'}} />
					) : p.prompt ? (
						<Pendiente prompt={p.prompt} />
					) : (
						// No picture was asked for: the frame carries the initials of the name, never a face that is not theirs.
						<AbsoluteFill style={{background: `linear-gradient(150deg, ${look.acento}55, ${look.oscuro ? '#0d0c0b' : '#cfc7b6'})`, alignItems: 'center', justifyContent: 'center'}}>
							<span style={{fontFamily: MARCADOR, fontWeight: 800, fontSize: 360, letterSpacing: '0.02em', color: look.tinta, opacity: 0.85}}>{(p.autor ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</span>
						</AbsoluteFill>
					)}
					<Semitono fuerza={0.4} />
				</div>
				{p.autor ? (
					<div style={{position: 'absolute', left: 110, top: 1050, opacity: ramp(tl, 0.3, 0.5)}}>
						<Marcador texto={p.autor} look={look} u={smooth(ramp(tl, 0.35, 0.7))} size={92} />
					</div>
				) : null}
				{pie}
			</FondoLamina>
		);
	}

	// recorte
	const entra = backOut(ramp(tl, 0, 0.4));
	const linea = smooth(ramp(tl, 0.35, 0.8));
	return (
		<FondoLamina look={look}>
			<Recorte imagen={p.imagen} prompt={p.prompt} look={look} style={{left: 170, top: 400, width: 640, height: 640, transform: `scale(${(0.86 + 0.14 * entra) * (1 + 0.04 * u)}) rotate(${-3 + 3 * entra}deg)`}} />
			{p.etiqueta ? (
				<>
					<svg width="1080" height="1920" style={{position: 'absolute', left: 0, top: 0}}>
						<path d="M 560 620 L 700 330 L 990 330" fill="none" stroke={look.tinta} strokeWidth={3} strokeDasharray="640" strokeDashoffset={640 * (1 - linea)} />
						<circle cx="560" cy="620" r={9 * linea} fill={look.acento} />
					</svg>
					<div style={{position: 'absolute', right: 90, top: 262, fontFamily: GROTESCA, fontSize: 50, fontWeight: 700, letterSpacing: '-0.04em', color: look.tinta, opacity: ramp(tl, 0.6, 0.85)}}>{p.etiqueta}</div>
				</>
			) : null}
			{pie}
		</FondoLamina>
	);
};

const WIDTH_RING = 800;

// Length of the transition a shot enters with, never more than part of the shot itself.
const duraEntrada = (p?: Plano) => (p ? Math.min(TRANSICIONES[p.transicion ?? 'corte'].dur, (p.hasta - p.desde) * 0.6) : 0);
const suave2 = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

// Wraps a shot with the way it enters and, while the next one comes in over it, the way it leaves.
const Entrada: React.FC<{p: Plano; sig?: Plano; indice: number; look: Look; children: React.ReactNode}> = ({p, sig, indice, look, children}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const tl = frame / fps;
	const dura = Math.round(p.hasta * fps) / fps - Math.round(p.desde * fps) / fps;
	const tipo = p.transicion ?? 'corte';
	const d = duraEntrada(p);
	const e = d > 0 ? ramp(tl, 0, d) : 1;
	const sale = sig?.transicion ?? 'corte';
	const ds = duraEntrada(sig);
	const s = ds > 0 ? ramp(tl, dura, dura + ds) : 0;
	// Whip pans alternate direction; the shot leaving goes the way the next one comes.
	const lado = (i: number) => (i % 2 ? -1 : 1);
	const foco = p.tipo === 'escena' ? FOCO[p.foco] : '50% 45%';
	const t: string[] = [];
	const fl: string[] = [];
	const st: React.CSSProperties = {};
	let blanco = 0;

	if (e < 1) {
		if (tipo === 'golpe') {
			t.push(`scale(${1 + 0.17 * (1 - easeOut3(e))})`);
			fl.push(`blur(${(7 * (1 - e)).toFixed(1)}px)`);
		}
		if (tipo === 'latigo') {
			t.push(`translateX(${(lado(indice) * (1 - easeOut3(e)) * 100).toFixed(2)}%)`);
			fl.push(`url(#barrido${e < 0.55 ? 2 : 1})`);
		}
		if (tipo === 'empuje') t.push(`translateY(${((1 - suave2(e)) * 100).toFixed(2)}%)`);
		if (tipo === 'destello') {
			// One bright frame and a fast decay: a flash that reads without blanking the picture for several frames.
			fl.push(`brightness(${(1 + 0.6 * (1 - e) ** 2).toFixed(2)})`);
			blanco = 0.72 * (1 - e) ** 3;
		}
		if (tipo === 'fallo') {
			// Jumps every other frame, as a signal dropping does.
			const q = Math.floor(frame / 2) + indice * 13;
			t.push(`translateX(${Math.round((azar(q) - 0.5) * 110 * (1 - e))}px) skewX(${((azar(q + 0.3) - 0.5) * 9 * (1 - e)).toFixed(1)}deg)`);
			fl.push(`hue-rotate(${Math.round((azar(q + 0.7) - 0.5) * 140)}deg) saturate(1.9) contrast(1.25)`);
		}
		if (tipo === 'disolver') {
			st.opacity = smooth(e);
			fl.push(`blur(${(18 * (1 - e)).toFixed(1)}px)`);
		}
		if (tipo === 'iris') st.clipPath = `circle(${(suave2(e) * 125).toFixed(1)}% at ${foco})`;
	}
	if (s > 0) {
		if (sale === 'latigo') {
			t.push(`translateX(${(-lado(indice + 1) * easeOut3(s) * 100).toFixed(2)}%)`);
			fl.push('url(#barrido2)');
		}
		if (sale === 'empuje') t.push(`translateY(${(-suave2(s) * 100).toFixed(2)}%)`);
		if (sale === 'disolver') fl.push(`blur(${(18 * s).toFixed(1)}px)`);
		if (sale === 'iris') fl.push(`brightness(${(1 - 0.55 * s).toFixed(2)}) blur(${(6 * s).toFixed(1)}px)`);
	}
	// The frame before a flash already burns a little.
	if (sale === 'destello' && sig) blanco = Math.max(blanco, 0.45 * ramp(tl, dura - 0.07, dura));

	return (
		<AbsoluteFill style={{...st, transform: t.length ? t.join(' ') : undefined, filter: fl.length ? fl.join(' ') : undefined, overflow: 'hidden'}}>
			{children}
			{tipo === 'fallo' && e < 1
				? [0, 1, 2, 3].map((k) => {
						const q = Math.floor(frame / 2) * 7 + k + indice;
						return <div key={k} style={{position: 'absolute', left: -80, right: -80, top: `${azar(q) * 92}%`, height: `${1 + azar(q + 0.2) * 5}%`, background: k % 2 ? look.acento : '#39e6ff', mixBlendMode: 'difference', opacity: 0.85 * (1 - e), transform: `translateX(${(azar(q + 0.4) - 0.5) * 140}px)`}} />;
					})
				: null}
			{blanco > 0.01 ? <AbsoluteFill style={{background: '#fff', opacity: blanco}} /> : null}
		</AbsoluteFill>
	);
};

export const Storytelling: React.FC<{pelicula: Pelicula}> = ({pelicula: f}) => {
	const {fps} = useVideoConfig();
	const look: Look = LOOKS[f.look];
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<Filtros />
			{f.planos.map((p, i) => {
				// Whole frames, cut to cut: the next shot starts on the frame this one ends.
				const from = Math.round(p.desde * fps);
				const dur = Math.max(1, Math.round(p.hasta * fps) - from);
				// A shot stays a little longer under a transition that shows both shots at once.
				const sig = f.planos[i + 1];
				const cola = sig && TRANSICIONES[sig.transicion ?? 'corte'].solapa ? Math.ceil(duraEntrada(sig) * fps) : 0;
				return (
					<Sequence key={i} from={from} durationInFrames={dur + cola}>
						<Entrada p={p} sig={sig} indice={i} look={look}>
							{p.tipo === 'escena' ? <Escena p={p} f={f} look={look} indice={i} /> : p.tipo === 'narrador' ? <Narrador p={p} f={f} look={look} /> : <Lamina p={p} f={f} look={look} />}
						</Entrada>
					</Sequence>
				);
			})}
			{f.voz ? <Html5Audio src={staticFile(f.voz)} /> : null}
			{f.sonido ? <Html5Audio src={staticFile(f.sonido)} volume={0.7} /> : null}
		</AbsoluteFill>
	);
};
