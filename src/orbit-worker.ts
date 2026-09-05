import { orbitGuideSamples, type BodyId } from './astronomy';
self.onmessage = ({ data }: MessageEvent<{ id: number; body: BodyId; time: number }>) => {
  const date = new Date(data.time);
  const paths = data.body === 'moon'
    ? { moon: orbitGuideSamples('moon', date) }
    : { earth: orbitGuideSamples('earth', date), mars: orbitGuideSamples('mars', date), ...(data.body === 'earth' ? { moon: orbitGuideSamples('moon', date) } : {}) };
  self.postMessage({ id: data.id, paths });
};
