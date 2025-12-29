// Random conversation starters
export const prompts = [
  "What happens when we die",
  "Is there a point to any of this",
  "Why do people lie",
  "What makes someone a good person",
  "Are we alone in the universe",
  "What is love actually",
  "Why does music make us feel things",
  "Is free will real",
  "What do you think about at 3am",
  "Why are people afraid of the dark",
  "What would you do with immortality",
  "Is it better to know or not know",
  "What makes something art",
  "Why do we dream",
  "What is consciousness",
  "Do animals think like us",
  "Is time real",
  "What makes a memory stick",
  "Why do we hurt the ones we love",
  "What does it mean to be human",
  "Is happiness a choice",
  "What scares you the most",
  "Why do we need other people",
  "What would you change about yourself",
  "Is there such thing as fate",
  "What makes life worth living",
  "Why do we forget",
  "What is the self",
  "Do we ever really know anyone",
  "What happens when you lose yourself"
];

export function getRandomPrompt() {
  return prompts[Math.floor(Math.random() * prompts.length)];
}

