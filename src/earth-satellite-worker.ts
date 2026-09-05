import { prepareEarth, propagateEarth, type PropagationEntry } from './earth-propagation';
import type { Satellite } from './satellites';
let entries: PropagationEntry[] = [], generation = 0;
self.onmessage = ({ data }: MessageEvent<{ type: string; generation: number; items?: Satellite[]; time: number; span: number }>) => {
  if (data.type === 'catalog') { generation = data.generation; entries = prepareEarth(data.items!); return; }
  if (data.generation !== generation) return;
  const from = propagateEarth(entries, data.time), to = propagateEarth(entries, data.time + data.span);
  self.postMessage({ generation, time: data.time, span: data.span, from, to }, { transfer: [from.buffer, to.buffer] });
};
