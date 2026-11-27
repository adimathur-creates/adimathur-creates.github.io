// Plain string checks for the failures that don't need an LLM to judge. They run on the transcript in milliseconds, for free.
// Q4 gender slip, Q5 leaked internal text, Q6 filler overuse. Everything else needs judgement and stays with the extraction.
const agentLines = (t) => t.split("\n").filter((l) => l.startsWith("assistant:")).map((l) => l.slice(10).trim());
const FEM = /\b(rahi hoon|rahi hu|karungi|karti hoon|deti hoon|sakti hoon|gayi|paayi|samjhi|बोल रही|करूंगी|करती|सकती)\b/i;
const MASC = /\b(samajh gaya|samjha|paaya|karunga|karta hoon|deta hoon|sakta hoon|raha hoon|समझ गया|करूंगा|करता हूं)\b/i;
const LEAK = /\{\{|\}\}|\(\s*[A-Za-z][^)]*\)|\b(function|tool_call|reschedule_delivery|log_outcome|send_payment_link)\b|_[a-z]+_/;
const FILLERS = ["ek second", "one moment", "hmm"];
function check(t) {
  const lines = agentLines(t), all = lines.join("\n").toLowerCase(), out = [];
  const fem = lines.some((l) => FEM.test(l)), masc = lines.some((l) => MASC.test(l));
  if (fem && masc) out.push("Q4");
  if (lines.some((l) => LEAK.test(l))) out.push("Q5");
  if (FILLERS.some((f) => all.split(f).length - 1 >= 3)) out.push("Q6");
  return out;
}
module.exports = { check, agentLines };
