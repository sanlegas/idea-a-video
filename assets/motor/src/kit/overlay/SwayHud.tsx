import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import type {World} from '../../schema';
import {Tag} from '../ui/Chip';
import {projectAt} from '../world/camera';
import type {WorldPlan} from '../world/CityWorld';

const VECTORS = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
const FORCE_COLORS = ['#2f6fd6', '#f2703a', '#1f9d6b'];

// Reads the same motion the 3D protagonist is performing, so the diagram can never disagree with the picture.
export const SwayHud: React.FC<{plan: WorldPlan; world: World}> = ({plan, world}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = frame / fps;
	const paper = plan.paperAt(t);
	const H = plan.stage.height;
	const flex = plan.flexAt(t);
	const bob = plan.bobAt(t);
	const pose = plan.pose(t);
	const base = projectAt(new THREE.Vector3(0, bob, 0), pose, width, height);
	const top = projectAt(new THREE.Vector3(flex, H + bob, 0), pose, width, height);
	const rest = projectAt(new THREE.Vector3(0, H, 0), pose, width, height);
	const amount = Math.min(1, Math.max(Math.abs(flex), Math.abs(bob)) / (H * 0.1));
	const direction = flex + bob >= 0 ? 1 : -1;
	const forces = world.diagram?.forces ?? [];
	const mid = projectAt(new THREE.Vector3(0, H * 0.4 + bob, 0), pose, width, height);
	const reveal = Math.min(1, paper * 1.4);
	return (
		<AbsoluteFill style={{pointerEvents: 'none', opacity: paper}}>
			<svg width={width} height={height} style={{position: 'absolute'}}>
				<line x1={base.x} y1={base.y} x2={rest.x} y2={rest.y - 30} stroke="#2f6fd6" strokeWidth={3} strokeDasharray="14 12" opacity={0.5} />
				<path d={`M ${base.x} ${base.y} Q ${base.x} ${(base.y + top.y) / 2} ${top.x} ${top.y}`} stroke="#f2703a" strokeWidth={6} fill="none" strokeLinecap="round" />
				<circle cx={top.x} cy={top.y} r={11} fill="#f2703a" />
				<polygon points={`${top.x + direction * 44},${top.y - 56} ${top.x + direction * (64 + 46 * amount)},${top.y - 56} ${top.x + direction * (44 + 46 * amount)},${top.y - 74}`} fill="#f2703a" opacity={0.4 + amount * 0.6} />
				{forces.map((f, i) => {
					const [dx, dy] = VECTORS[f.direction];
					const horizontal = dx !== 0;
					const ox = horizontal ? (dx > 0 ? 110 : -110) : (i % 2 ? 130 : -130);
					const oy = horizontal ? -60 : dy > 0 ? 130 : -130;
					const x0 = mid.x + ox;
					const y0 = mid.y + oy;
					const length = (150 + 90 * Math.abs(Math.sin(t * 2 + i))) * reveal;
					const x1 = x0 + dx * length;
					const y1 = y0 + dy * length;
					const nx = -dy * 30;
					const ny = dx * 30;
					const color = FORCE_COLORS[i % FORCE_COLORS.length];
					return (
						<g key={i} opacity={reveal}>
							<line x1={x0} y1={y0} x2={x1 - dx * 30} y2={y1 - dy * 30} stroke={color} strokeWidth={22} />
							<polygon points={`${x1 + dx * 26},${y1 + dy * 26} ${x1 - dx * 34 + nx},${y1 - dy * 34 + ny} ${x1 - dx * 34 - nx},${y1 - dy * 34 - ny}`} fill={color} />
						</g>
					);
				})}
			</svg>
			{forces.map((f, i) => {
				const [dx, dy] = VECTORS[f.direction];
				const x = mid.x + (dx !== 0 ? (dx > 0 ? 170 : -360) : i % 2 ? 60 : -240);
				const y = Math.min(1560, mid.y + (dx !== 0 ? -130 : dy > 0 ? 330 : -440));
				return (
					<Tag key={i} x={Math.min(width - 280, Math.max(30, x))} y={y} color={FORCE_COLORS[i % FORCE_COLORS.length]} size={40} opacity={reveal}>
						{f.label}
					</Tag>
				);
			})}
			<Tag x={70} y={1640} color="#6ea8ff" size={38}>
				{world.diagram?.label}
			</Tag>
			<div style={{position: 'absolute', left: 70, top: 1716, width: 940, height: 40, borderRadius: 10, background: 'rgba(14,18,27,.9)'}}>
				<div style={{position: 'absolute', left: 8, top: 8, height: 24, width: `${amount * 924}px`, borderRadius: 6, background: '#6ea8ff'}} />
			</div>
		</AbsoluteFill>
	);
};
