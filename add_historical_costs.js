// Add historical costs from vetted-cost-raw.yaml to the equipment database
import { getEmbedding } from './vectorDB.js';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import fs from 'fs';
import yaml from 'js-yaml';

const dbPath = './data/equipment_demo.db';
const db = new Database(dbPath);
sqliteVec.load(db);

// Add historical costs table
db.exec(`
  CREATE TABLE IF NOT EXISTS historical_costs (
    id TEXT PRIMARY KEY,
    source_file TEXT,
    category TEXT,
    description TEXT,
    qty REAL,
    unit TEXT,
    unit_cost REAL,
    total_cost REAL,
    eul REAL,
    eff_age REAL,
    comment TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS cost_vectors USING vec0(
    cost_id TEXT PRIMARY KEY,
    embedding FLOAT[384]
  );
`);

async function main() {
  console.log('=== LOADING HISTORICAL COSTS ===\n');

  const yamlPath = '/Users/chris/chungus/dev/meap2-it/reference/data/cost-database/vetted-cost-raw.yaml';
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const data = yaml.load(content);

  console.log(`Source: ${data.metadata.source}`);
  console.log(`Items: ${data.metadata.total_items}\n`);

  let count = 0;
  for (const item of data.items) {
    const textToEmbed = `${item.description || ''} ${item.comment || ''}`.trim();
    if (!textToEmbed) continue;

    const embedding = await getEmbedding(textToEmbed);
    const id = `cost-${count}`;

    // Store metadata
    db.prepare(`
      INSERT OR REPLACE INTO historical_costs
      (id, source_file, category, description, qty, unit, unit_cost, total_cost, eul, eff_age, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      item.source_file || '',
      item.category || '',
      item.description || '',
      item.qty || null,
      item.unit || '',
      item.unit_cost || null,
      item.total_cost || null,
      item.eul || null,
      item.eff_age || null,
      item.comment || ''
    );

    // Store vector
    db.prepare(`
      INSERT OR REPLACE INTO cost_vectors (cost_id, embedding)
      VALUES (?, vec_f32(?))
    `).run(id, new Float32Array(embedding));

    count++;
    if (count % 20 === 0) console.log(`  Embedded ${count} items...`);
  }

  console.log(`\n✅ Loaded ${count} historical cost items\n`);

  // === DEMO: Query across BOTH equipment and historical costs ===
  console.log('=== COMBINED SEARCH: Equipment + Historical Costs ===\n');

  const queries = [
    "rooftop air conditioning unit replacement",
    "water heater replacement",
    "electrical switchboard maintenance",
    "split system air conditioning"
  ];

  for (const query of queries) {
    console.log(`🔍 Query: "${query}"\n`);
    const queryEmbedding = await getEmbedding(query);
    const vecArray = new Float32Array(queryEmbedding);

    // Search current equipment
    console.log('   📋 Current Projects:');
    const equipResults = db.prepare(`
      SELECT e.project, e.equipment_description, e.condition, ev.distance
      FROM equipment_vectors ev
      JOIN equipment e ON ev.equipment_id = e.id
      WHERE ev.embedding MATCH vec_f32(?) AND k = 2
      ORDER BY ev.distance
    `).all(vecArray);

    equipResults.forEach(r => {
      const sim = ((1 - r.distance) * 100).toFixed(1);
      console.log(`      [${sim}%] ${r.project}: ${r.equipment_description.substring(0, 50)}...`);
    });

    // Search historical costs
    console.log('\n   💰 Historical Costs:');
    const costResults = db.prepare(`
      SELECT hc.category, hc.description, hc.qty, hc.unit, hc.unit_cost, cv.distance
      FROM cost_vectors cv
      JOIN historical_costs hc ON cv.cost_id = hc.id
      WHERE cv.embedding MATCH vec_f32(?) AND k = 2
      ORDER BY cv.distance
    `).all(vecArray);

    costResults.forEach(r => {
      const sim = ((1 - r.distance) * 100).toFixed(1);
      const price = r.unit_cost ? `$${r.unit_cost.toLocaleString()}/${r.unit}` : 'N/A';
      console.log(`      [${sim}%] ${r.category}: ${r.description.substring(0, 45)}...`);
      console.log(`              → ${r.qty} ${r.unit} @ ${price}`);
    });

    console.log('\n---\n');
  }

  // Summary
  const equipCount = db.prepare('SELECT COUNT(*) as c FROM equipment').get().c;
  const costCount = db.prepare('SELECT COUNT(*) as c FROM historical_costs').get().c;
  console.log('=== DATABASE SUMMARY ===');
  console.log(`Current equipment: ${equipCount} items`);
  console.log(`Historical costs:  ${costCount} items`);
  console.log(`Total searchable:  ${equipCount + costCount} items`);
}

main().catch(console.error);
