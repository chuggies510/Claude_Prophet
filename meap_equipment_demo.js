// Demo: Load MEAP equipment CSVs and test similarity search
import { getEmbedding } from './vectorDB.js';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import fs from 'fs';
import path from 'path';

// Initialize database in prophet's data folder for demo
const dbPath = './data/equipment_demo.db';
const db = new Database(dbPath);
sqliteVec.load(db);

// Create tables
db.exec(`
  DROP TABLE IF EXISTS equipment;
  DROP TABLE IF EXISTS equipment_vectors;

  CREATE TABLE equipment (
    id TEXT PRIMARY KEY,
    project TEXT,
    discipline TEXT,
    tag TEXT,
    equipment_description TEXT,
    condition TEXT,
    notes TEXT
  );

  CREATE VIRTUAL TABLE equipment_vectors USING vec0(
    equipment_id TEXT PRIMARY KEY,
    embedding FLOAT[384]
  );
`);

// Parse CSV (simple parser for this demo)
function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

// Cosine similarity
function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  const csvFiles = [
    { path: '/Users/chris/2_project-files/projects/m2-clients/inova-reno/analysis/main-items.csv', project: 'inova-reno' },
    { path: '/Users/chris/2_project-files/projects/m2-clients/sabre-springs/analysis/sabre-springs-items.csv', project: 'sabre-springs' },
    { path: '/Users/chris/2_project-files/projects/m2-clients/pacific-vista-commerce-center/analysis/pacific-vista-items.csv', project: 'pacific-vista' },
  ];

  console.log('=== LOADING EQUIPMENT FROM CSVs ===\n');

  let totalItems = 0;
  const allEmbeddings = [];

  for (const file of csvFiles) {
    if (!fs.existsSync(file.path)) {
      console.log(`⚠️ Skipping ${file.project} - file not found`);
      continue;
    }

    const items = parseCSV(file.path);
    console.log(`📁 ${file.project}: ${items.length} items`);

    for (const item of items) {
      const desc = item.Equipment_Description || item.equipment_description || '';
      const notes = item.Notes || item.notes || '';
      const tag = item.TAG || item.tag || `item-${totalItems}`;
      const condition = item.Condition_2025 || item.condition || '';
      const discipline = item.Discipline || item.discipline || '';

      const textToEmbed = `${desc} ${notes}`.trim();
      if (!textToEmbed || textToEmbed.length < 10) continue;

      const embedding = await getEmbedding(textToEmbed);
      const id = `${file.project}-${tag}`;

      // Store metadata
      db.prepare(`
        INSERT OR REPLACE INTO equipment (id, project, discipline, tag, equipment_description, condition, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, file.project, discipline, tag, desc, condition, notes);

      // Store vector
      db.prepare(`
        INSERT OR REPLACE INTO equipment_vectors (equipment_id, embedding)
        VALUES (?, vec_f32(?))
      `).run(id, new Float32Array(embedding));

      allEmbeddings.push({ id, embedding, desc: desc.substring(0, 50), condition });
      totalItems++;
    }
  }

  console.log(`\n✅ Loaded ${totalItems} equipment items\n`);

  // === DEMO 1: Find similar equipment ===
  console.log('=== DEMO 1: SIMILARITY SEARCH ===\n');

  const queries = [
    "pool circulation pump failure",
    "gas fired water heater",
    "roof mounted air conditioning unit",
    "corroded exhaust fan"
  ];

  for (const query of queries) {
    console.log(`🔍 Query: "${query}"\n`);

    const queryEmbedding = await getEmbedding(query);

    // Find top 3 matches
    const results = db.prepare(`
      SELECT
        e.id,
        e.project,
        e.equipment_description,
        e.condition,
        e.notes,
        ev.distance
      FROM equipment_vectors ev
      JOIN equipment e ON ev.equipment_id = e.id
      WHERE ev.embedding MATCH vec_f32(?)
        AND k = 3
      ORDER BY ev.distance
    `).all(new Float32Array(queryEmbedding));

    results.forEach((r, i) => {
      const similarity = ((1 - r.distance) * 100).toFixed(1);
      console.log(`   ${i+1}. [${similarity}%] ${r.project}`);
      console.log(`      ${r.equipment_description.substring(0, 70)}...`);
      console.log(`      Condition: ${r.condition}`);
      if (r.notes) console.log(`      Notes: ${r.notes.substring(0, 60)}...`);
      console.log('');
    });
    console.log('---\n');
  }

  // === DEMO 2: Find all Poor condition equipment similar to a query ===
  console.log('=== DEMO 2: POOR CONDITION ITEMS LIKE "water heater" ===\n');

  const waterHeaterQuery = await getEmbedding("domestic water heater failed");

  const poorItems = db.prepare(`
    SELECT
      e.id,
      e.project,
      e.equipment_description,
      e.notes,
      ev.distance
    FROM equipment_vectors ev
    JOIN equipment e ON ev.equipment_id = e.id
    WHERE ev.embedding MATCH vec_f32(?)
      AND k = 10
      AND e.condition = 'Poor'
    ORDER BY ev.distance
  `).all(new Float32Array(waterHeaterQuery));

  if (poorItems.length === 0) {
    console.log('   No Poor condition items found matching "water heater"\n');
  } else {
    poorItems.forEach((r, i) => {
      const similarity = ((1 - r.distance) * 100).toFixed(1);
      console.log(`   ${i+1}. [${similarity}%] ${r.project} - ${r.equipment_description.substring(0, 50)}`);
      if (r.notes) console.log(`      → ${r.notes.substring(0, 70)}`);
    });
  }

  console.log('\n=== DEMO COMPLETE ===');
  console.log(`Database: ${dbPath}`);
  console.log(`Total equipment embedded: ${totalItems}`);
}

main().catch(console.error);
