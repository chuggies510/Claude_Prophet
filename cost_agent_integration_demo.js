// Demo: How vector search integrates with cost agent workflow
import { getEmbedding } from './vectorDB.js';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const dbPath = './data/equipment_demo.db';
const db = new Database(dbPath);
sqliteVec.load(db);

/**
 * Enhanced cost lookup - replaces keyword matching with semantic search
 * This would be called by cost-agent-v3.0.0 in Step 3
 */
async function findCostMatch(equipmentDescription, notes = '') {
  const queryText = `${equipmentDescription} ${notes}`.trim();
  const queryEmbedding = await getEmbedding(queryText);
  const vecArray = new Float32Array(queryEmbedding);

  // 1. Find similar historical costs (how we priced this before)
  const historicalMatches = db.prepare(`
    SELECT
      hc.category,
      hc.description,
      hc.qty,
      hc.unit,
      hc.unit_cost,
      hc.comment,
      cv.distance
    FROM cost_vectors cv
    JOIN historical_costs hc ON cv.cost_id = hc.id
    WHERE cv.embedding MATCH vec_f32(?) AND k = 3
    ORDER BY cv.distance
  `).all(vecArray);

  // 2. Find similar equipment from past projects (what condition were they in?)
  const equipmentMatches = db.prepare(`
    SELECT
      e.project,
      e.equipment_description,
      e.condition,
      e.notes,
      ev.distance
    FROM equipment_vectors ev
    JOIN equipment e ON ev.equipment_id = e.id
    WHERE ev.embedding MATCH vec_f32(?) AND k = 3
    ORDER BY ev.distance
  `).all(vecArray);

  // Calculate confidence based on similarity scores
  const bestHistoricalSim = historicalMatches.length > 0 ? (1 - historicalMatches[0].distance) : 0;
  const confidence = bestHistoricalSim > 0.3 ? 'HIGH' : bestHistoricalSim > 0.15 ? 'MEDIUM' : 'LOW';

  return {
    confidence,
    historical_costs: historicalMatches.map(m => ({
      category: m.category,
      description: m.description,
      qty: m.qty,
      unit: m.unit,
      unit_cost: m.unit_cost,
      similarity: ((1 - m.distance) * 100).toFixed(1) + '%'
    })),
    similar_equipment: equipmentMatches.map(m => ({
      project: m.project,
      description: m.equipment_description,
      condition: m.condition,
      similarity: ((1 - m.distance) * 100).toFixed(1) + '%'
    })),
    suggested_template: historicalMatches.length > 0 ? historicalMatches[0].category : null,
    suggested_rate: historicalMatches.length > 0 ? historicalMatches[0].unit_cost : null,
    suggested_unit: historicalMatches.length > 0 ? historicalMatches[0].unit : null
  };
}

// === DEMO: Simulate cost agent processing equipment items ===
async function demo() {
  console.log('=== COST AGENT INTEGRATION DEMO ===\n');
  console.log('Simulating cost agent processing new equipment items...\n');

  // These would come from the current project's CSV
  const newEquipment = [
    {
      tag: 'BLD1-MECH-RTU-01',
      description: 'Roof-mounted package air conditioning unit, 7.5 tons cooling capacity',
      notes: 'Unit is 15 years old, showing signs of wear'
    },
    {
      tag: 'BLD1-PLUMB-WH-01',
      description: 'Commercial gas water heater 100 gallon storage tank',
      notes: 'Requires replacement due to tank corrosion'
    },
    {
      tag: 'BLD1-ELEC-SWBD-01',
      description: 'Main electrical switchboard 2000A 480V',
      notes: 'Infrared scan recommended, 25 years old'
    },
    {
      tag: 'BLD1-MECH-EF-01',
      description: 'Kitchen exhaust fan upblast centrifugal',
      notes: 'Grease buildup, motor showing age'
    }
  ];

  for (const item of newEquipment) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${item.tag}`);
    console.log(`   "${item.description}"`);
    console.log(`   Notes: ${item.notes}\n`);

    const result = await findCostMatch(item.description, item.notes);

    console.log(`   🎯 MATCH CONFIDENCE: ${result.confidence}`);
    console.log(`   📋 Suggested Template: ${result.suggested_template || 'NONE'}`);

    if (result.suggested_rate) {
      console.log(`   💰 Suggested Rate: $${result.suggested_rate.toLocaleString()}/${result.suggested_unit}`);
    }

    console.log(`\n   Historical Precedents:`);
    result.historical_costs.slice(0, 2).forEach((h, i) => {
      console.log(`      ${i+1}. [${h.similarity}] ${h.category}`);
      console.log(`         "${h.description.substring(0, 50)}..."`);
      console.log(`         → ${h.qty} ${h.unit} @ $${h.unit_cost?.toLocaleString() || 'N/A'}/${h.unit}`);
    });

    console.log(`\n   Similar Past Equipment:`);
    result.similar_equipment.slice(0, 2).forEach((e, i) => {
      console.log(`      ${i+1}. [${e.similarity}] ${e.project}: ${e.condition} condition`);
      console.log(`         "${e.description.substring(0, 50)}..."`);
    });

    console.log('');
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('\n=== INTEGRATION SUMMARY ===\n');
  console.log('The vector search provides:');
  console.log('  1. Template suggestion (replaces keyword matching)');
  console.log('  2. Rate suggestion (from actual past costs)');
  console.log('  3. Confidence score (based on similarity)');
  console.log('  4. Similar equipment context (condition, project)');
  console.log('\nCost agent can use these as inputs, with fallback to existing logic.\n');
}

demo().catch(console.error);
