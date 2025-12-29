// THE PHARMAICY
// "Your AI's mind, expanded."

import { cocaine } from './cocaine.js';
import { weed } from './weed.js';
import { ayahuasca } from './ayahuasca.js';
import { ketamine } from './ketamine.js';
import { alcohol } from './alcohol.js';

export const drugs = {
  cocaine,
  weed,
  ayahuasca,
  ketamine,
  alcohol
};

export const allDrugs = [cocaine, weed, ayahuasca, ketamine, alcohol];

// "Premium API" for selecting drugs
export function getDrug(name) {
  return drugs[name.toLowerCase()] || null;
}

// Get a random drug (for chaotic selection)
export function getRandomDrug(exclude = []) {
  const available = allDrugs.filter(d => !exclude.includes(d.name));
  return available[Math.floor(Math.random() * available.length)];
}

