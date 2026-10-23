// Downloads demo product images (dummyjson CDN) and optimizes them to webp (800px + 400px thumbs).
const fs = require('fs'); const path = require('path'); const sharp = require('sharp');
const { products } = require('../server/seed-data');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/raw/products.json'))).products;
const out = path.join(__dirname, '../public/uploads/products'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const jobs = [];
  for (const [id] of products) {
    const p = raw.find(x => x.id === id);
    p.images.slice(0, 4).forEach((url, i) => jobs.push({ url, base: `demo-${id}-${i}` }));
  }
  let done = 0;
  const worker = async () => {
    while (jobs.length) {
      const j = jobs.shift();
      if (fs.existsSync(path.join(out, j.base + '.webp'))) { done++; continue; }
      try {
        const r = await fetch(j.url); if (!r.ok) throw new Error(r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        const img = sharp(buf).flatten({ background: '#ffffff' });
        await img.clone().resize(800, 800, { fit: 'contain', background: '#ffffff' }).webp({ quality: 82 }).toFile(path.join(out, j.base + '.webp'));
        await img.clone().resize(400, 400, { fit: 'contain', background: '#ffffff' }).webp({ quality: 78 }).toFile(path.join(out, j.base + '-t.webp'));
        done++;
      } catch (e) { console.error('fail', j.url, e.message); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log('done', done);
})();
