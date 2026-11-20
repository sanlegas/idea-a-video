import * as THREE from 'three';
import {ramp} from '../film';
import {project, type Pose} from '../stage/pose';

type Anchor = THREE.Vector3 | THREE.Object3D | null;

type Entry = {
	element: HTMLDivElement;
	anchor: Anchor;
	x: number;
	y: number;
	offset: [number, number];
	tag: {text: string; opacity: number};
	sync?: (t: number) => void;
};

const point = new THREE.Vector3();
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
// Tags stay clear of the narration above and of the app buttons that cover the phone's lower edge.
const TOP = 500;
const BOTTOM = 220;
const SIDE = 40;

// HTML drawn over the 3D view: crisp text that follows the scene and shares the frame it was rendered for.
export class Hud {
	private entries: Entry[] = [];

	constructor(private root: HTMLElement | null, private width: number, private height: number) {
		root?.replaceChildren();
	}

	private add(element: HTMLDivElement, anchor: Anchor, x: number, y: number, offset: [number, number]) {
		this.root?.appendChild(element);
		const tag = {text: '', opacity: 1};
		const entry: Entry = {element, anchor, x, y, offset, tag};
		this.entries.push(entry);
		return entry;
	}

	label(text: string, {at, offset = [0, 0], size = 40, color = '#ffffff'}: {at: THREE.Vector3 | THREE.Object3D; offset?: [number, number]; size?: number; color?: string}) {
		const element = document.createElement('div');
		element.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;font-family:Figtree;font-weight:700;font-size:${size}px;color:${color};padding:8px 20px;border-radius:16px;background:rgba(12,10,14,0.62);border:1.5px solid rgba(255,255,255,0.14)`;
		const entry = this.add(element, at, 0, 0, offset);
		entry.tag.text = text;
		return entry.tag;
	}

	counter(o: {from: number; to: number; start: number; end: number; unit: string; singular?: string; decimals?: number; x?: number; y?: number; at?: THREE.Vector3 | THREE.Object3D; hide?: number}, glow: string) {
		const element = document.createElement('div');
		element.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:baseline;gap:16px;padding:20px 40px 24px;border-radius:34px;background:rgba(18,10,12,0.74);border:1.5px solid rgba(255,255,255,0.13);box-shadow:0 12px 38px rgba(0,0,0,0.34);font-family:Figtree;white-space:nowrap';
		const value = document.createElement('span');
		value.style.cssText = `font-size:100px;line-height:100px;font-weight:800;color:#fff1ea;font-variant-numeric:tabular-nums;text-shadow:0 0 26px ${glow}`;
		const unit = document.createElement('span');
		unit.style.cssText = 'font-size:44px;font-weight:700;color:#ffe6dc';
		element.append(value, unit);
		const entry = this.add(element, o.at ?? null, o.x ?? 770, o.y ?? 576, [0, 0]);
		entry.sync = (t) => {
			const n = o.from + (o.to - o.from) * ramp(t, o.start, o.end);
			const decimals = o.decimals ?? 0;
			const [whole, part] = n.toFixed(decimals).split('.');
			value.textContent = whole.replace(/\B(?=(\d{3})+$)/g, '.') + (part ? `,${part}` : '');
			unit.textContent = Math.abs(n - 1) < 1e-6 && o.singular ? o.singular : o.unit;
			element.style.opacity = String(entry.tag.opacity * (o.hide === undefined ? 1 : 1 - ramp(t, o.hide, o.hide + 0.16)));
		};
		return entry.tag;
	}

	sync(t: number, pose: Pose) {
		this.entries.forEach((e) => {
			let {x, y} = e;
			if (e.anchor) {
				if (e.anchor instanceof THREE.Vector3) point.copy(e.anchor);
				else e.anchor.getWorldPosition(point);
				const at = project(point, pose, this.width, this.height);
				x = at.x;
				y = at.y;
			}
			if (e.sync) e.sync(t);
			else {
				e.element.textContent = e.tag.text;
				e.element.style.opacity = String(e.tag.opacity);
			}
			const halfWide = e.element.offsetWidth / 2;
			const halfTall = e.element.offsetHeight / 2;
			const left = clamp(x + e.offset[0], SIDE + halfWide, this.width - SIDE - halfWide);
			const top = clamp(y + e.offset[1], TOP + halfTall, this.height - BOTTOM - halfTall);
			e.element.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`;
		});
	}
}
