// Demo: Show embeddings for water heater descriptions
import { getEmbedding } from './vectorDB.js';

const sentences = [
  "Gas Fired water heater(s) with 50-gallon capacity",
  "Domestic hot water is provided by Gas Fired water heater(s) with 50-gallon capacity",
  "50 gal gas water heater for DHW",
  "Natural gas domestic water heater, 50 gal"
];

// Completely different sentence for comparison
const differentSentence = "The roof-mounted air handling unit serves the lobby area";

async function demo() {
  console.log("Generating embeddings...\n");

  const embeddings = [];
  for (const s of sentences) {
    const vec = await getEmbedding(s);
    embeddings.push(vec);
    console.log(`"${s.substring(0, 50)}..."`);
    console.log(`  First 10 values: [${vec.slice(0, 10).map(v => v.toFixed(4)).join(', ')}]`);
    console.log(`  Vector length: ${vec.length}\n`);
  }

  // Get embedding for different sentence
  const diffVec = await getEmbedding(differentSentence);
  console.log(`"${differentSentence}"`);
  console.log(`  First 10 values: [${diffVec.slice(0, 10).map(v => v.toFixed(4)).join(', ')}]\n`);

  // Calculate cosine similarity between all pairs
  console.log("=== SIMILARITY MATRIX ===\n");
  console.log("Cosine similarity (1.0 = identical, 0.0 = unrelated):\n");

  function cosineSim(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Compare water heater sentences to each other
  console.log("Water heater descriptions (should be HIGH similarity):");
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const sim = cosineSim(embeddings[i], embeddings[j]);
      console.log(`  [${i+1}] vs [${j+1}]: ${(sim * 100).toFixed(1)}%`);
    }
  }

  // Compare to different sentence
  console.log("\nWater heater vs AHU (should be LOW similarity):");
  for (let i = 0; i < embeddings.length; i++) {
    const sim = cosineSim(embeddings[i], diffVec);
    console.log(`  [${i+1}] vs AHU: ${(sim * 100).toFixed(1)}%`);
  }
}

demo().catch(console.error);
