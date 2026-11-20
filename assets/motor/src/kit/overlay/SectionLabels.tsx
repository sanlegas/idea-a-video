import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import type {World} from '../../schema';
import {Tag} from '../ui/Chip';
import {projectAt} from '../world/camera';
import type {WorldPlan} from '../world/CityWorld';

// Labels live in the 3D world and are projected each frame, so they stay glued to the layers as the camera moves.
export const SectionLabels: React.FC<{plan: WorldPlan; world: World; counter: {to: number; unit: string} | null}> = ({plan, world, counter}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = frame / fps;
	const pose = plan.pose(t);
	const {stage} = plan;
	const z = stage.behind ? -stage.cutZ : stage.cutZ;
	const at = (x: number, y: number) => projectAt(new THREE.Vector3(x, y, z + 1), pose, width, height);
	const depth = plan.depthAt(t);
	const reach = world.cutaway?.piles?.tip ?? -stage.depth * 0.8;
	const tip = at(world.hero.width * 0.7, depth * reach);
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{world.cutaway?.layers.slice(0, 4).map((l, i) => {
				const p = at(0, (l.from + l.to) / 2);
				return p.y > 60 && p.y < height - 60 ? (
					<Tag key={i} x={46} y={p.y - 30} color="#f2e4c8" size={44}>
						{l.name.replace(/_/g, ' ')}
					</Tag>
				) : null;
			})}
			{counter && depth > 0 ? (
				<Tag x={Math.min(width - 230, tip.x + 18)} y={tip.y - 30} color="#ffd24a" size={54}>
					{Math.round(counter.to * depth)} {counter.unit}
				</Tag>
			) : null}
		</AbsoluteFill>
	);
};
